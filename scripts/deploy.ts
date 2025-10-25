import { ethers, upgrades } from "hardhat";
import { createHash } from "crypto";
import { readFileSync } from "fs";
import { join } from "path";
import { getImplementationAddress } from "@openzeppelin/upgrades-core";
import hre from "hardhat";
import { privateKeyToAccount } from "viem/accounts";
import { Address, createPublicClient, Hex, http } from "viem";
import { toCoinbaseSmartAccount } from "viem/account-abstraction";
import { baseSepolia } from "viem/chains";

// Helper function to add delay between transactions
function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Helper function to get source code hash
function getSourceCodeHash(filePath: string): string {
    try {
        const content = readFileSync(filePath, 'utf8');
        // Remove comments and normalize whitespace for better comparison
        const normalizedContent = content
            .replace(/\/\*[\s\S]*?\*\//g, '') // Remove block comments
            .replace(/\/\/.*$/gm, '') // Remove line comments
            .replace(/\s+/g, ' ') // Normalize whitespace
            .trim();
        return createHash('sha256').update(normalizedContent).digest('hex');
    } catch (error) {
        console.log(`⚠️  Could not read source file: ${filePath}`);
        return '';
    }
}

async function main() {
    console.log("Network:", hre.network.name);
    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with the account:", deployer.address);

    if (!process.env.RELAYER_PRIVATE_KEY) {
        console.log("RELAYER_PRIVATE_KEY is not set");
        return;
    }

    const GAME_ENGINE_ADDRESS = process.env.GAME_ENGINE_ADDRESS;
    const PUBLIC_KEY = process.env.PUBLIC_KEY;

    if (!GAME_ENGINE_ADDRESS) {
        console.log("GAME_ENGINE_ADDRESS env is not set");
        return;
    }

    if (!PUBLIC_KEY) {
        console.log("PUBLIC_KEY env is not set");
        return;
    }

    const RPC_URL = process.env.RPC_URL;
    if (!RPC_URL) {
        console.log("RPC_URL env is not set");
        return;
    }

    const owner = privateKeyToAccount(process.env.RELAYER_PRIVATE_KEY as Hex);

    const publicClient = createPublicClient({
        chain: baseSepolia,
        transport: http(RPC_URL)
    });

    const relayerAddress = process.env.RELAYER_ADDRESS as Address;
    if (!relayerAddress) {
        console.log("RELAYER_ADDRESS env is not set");
        return;
    }

    // Create Coinbase smart wallet using the EOA signer
    const smartAccount = await toCoinbaseSmartAccount({
        client: publicClient,
        owners: [owner],
        version: '1.1' // Specify version as required
    });

    const relayerSmartAccountAddress = await smartAccount.getAddress();

    console.log("Relayer smart account address:", relayerSmartAccountAddress);

    // Step 1: Deploy libraries first
    console.log("\n=== Deploying Libraries ===");
    const gameLibPath = join(__dirname, '../contracts/GameLib.sol');


    // Read deployment.json to compare hashes
    let deploymentConfig;
    try {
        const deploymentJson = readFileSync(join(__dirname, '../deployment.json'), 'utf8');
        deploymentConfig = JSON.parse(deploymentJson);
    } catch (error) {
        console.log("⚠️  Could not read deployment.json");
        deploymentConfig = {};
    }


    // Deploy GameLib
    console.log("Deploying GameLib...");
    const GameLib = await ethers.getContractFactory("GameLib");
    const gameLib = await GameLib.deploy({ gasLimit: 5000000 });
    console.log('waiting for deployment...');
    await gameLib.waitForDeployment();
    const gameLibAddress = await gameLib.getAddress();
    console.log("GameLib deployed to:", gameLibAddress);

    // Wait a bit before next deployment
    console.log("Waiting 5 seconds before next deployment...");
    await delay(5000);


    // Step 2: Deploy the implementation contract first
    console.log("\n=== Deploying Implementation Contract ===");

    const ChessBallGame = await ethers.getContractFactory("ChessBallGame", {
        libraries: {
            GameLib: gameLibAddress
        }
    });

    // Step 3: Deploy the proxy contract
    console.log("\n=== Deploying Proxy Contract ===");

    const constructorArgs = [
        relayerAddress,
        relayerSmartAccountAddress,
        GAME_ENGINE_ADDRESS,
        PUBLIC_KEY
    ];

    // Deploy using UUPS proxy pattern
    const chessBallGame = await upgrades.deployProxy(ChessBallGame, constructorArgs, {
        kind: 'uups',
        initializer: 'initialize',
        unsafeAllowLinkedLibraries: true
    });

    await chessBallGame.waitForDeployment();

    const proxyAddress = await chessBallGame.getAddress();
    console.log("ChessBallGame deployed to:", proxyAddress);

    console.log("Waiting 5 seconds before getting implementation address...");
    await delay(5000);

    const currentImplAddress = await getImplementationAddress(ethers.provider, proxyAddress);
    console.log("Implementation deployed to:", currentImplAddress);
    console.log("Proxy deployed to:", proxyAddress);

    // Step 4: Verify the deployment
    console.log("\n=== Verifying Deployment ===");

    try {
        const gelatoAddress = await chessBallGame.gelatoAddress();
        const relayerAddress = await chessBallGame.relayerAddress();
        const relayerSmartAccountAddress = await chessBallGame.relayerSmartAccountAddress();
        const owner = await chessBallGame.owner();

        console.log("Gelato address:", gelatoAddress);
        console.log("Relayer address:", relayerAddress);
        console.log("Relayer smart account address:", relayerSmartAccountAddress);
        console.log("Owner:", owner);
    } catch (error: any) {
        console.log("Warning: Could not verify contract state. This might be due to proxy initialization issues.");
        console.log("Error details:", error.message);
    }

    // Verify library addresses are correctly linked
    console.log("\n=== Library Verification ===");
    console.log("Expected GameLib address:", gameLibAddress);

    // Step 5: Calculate source code hashes for future comparisons
    console.log("\n=== Calculating Source Code Hashes ===");
    const gameLibHash = getSourceCodeHash(gameLibPath);
    console.log("GameLib source hash:", gameLibHash);

    // Save deployment info
    const deploymentInfo = {
        network: (await ethers.provider.getNetwork()).name,
        chainId: (await ethers.provider.getNetwork()).chainId.toString(),
        proxyAddress: proxyAddress,
        implementationAddress: currentImplAddress,
        libraries: {
            gameLib: gameLibAddress
        },
        deployer: deployer.address,

        timestamp: new Date().toISOString(),
        // Store actual source code hashes for future comparisons
        gameLibHash: gameLibHash
    };

    console.log("\n=== Deployment Summary ===");
    console.log(JSON.stringify(deploymentInfo, null, 2));

    // Save to deployment.json file, preserving other networks
    const fs = require('fs');
    const path = require('path');
    const deploymentFile = 'deployment.json';

    let allDeployments: Record<string, any> = {};
    if (fs.existsSync(deploymentFile)) {
        try {
            const existingContent = fs.readFileSync(deploymentFile, 'utf8');
            allDeployments = JSON.parse(existingContent);
        } catch (error) {
            console.log("⚠️  Could not parse existing deployment.json, starting fresh");
            allDeployments = {};
        }
    }

    // Add/update deployment for current network
    const networkName = (await ethers.provider.getNetwork()).name;
    const networkKey = networkName; // Use network name as key
    allDeployments[networkKey] = deploymentInfo;

    fs.writeFileSync(deploymentFile, JSON.stringify(allDeployments, null, 2));
    console.log(`\nDeployment info saved to deployment.json under network: ${networkKey}`);
    console.log(`📁 File now contains deployments for ${Object.keys(allDeployments).length} network(s)`);

    console.log("Vefrifying implementation..");
    await hre.run("verify:verify", {
        address: currentImplAddress,
    });

    console.log("All done!");

}

// Export function for use in other scripts
export {
    main as deploy
};

// Run deployment if this script is executed directly
if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
}
