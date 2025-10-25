"use client";

import React, { useState } from 'react';

export default function RulesOfGame() {
    const [isTocExpanded, setIsTocExpanded] = useState(false);
    return (
        <div>
            <div className="flex justify-center mb-6 mt-6">
                <a href="/" className="cursor-pointer hover:opacity-80 transition-opacity">
                    <img src="/logo2.png" alt="TactiBall Logo" className="h-32" />
                </a>
            </div>

            <div className="max-w-4xl mx-auto p-6 bg-white shadow-md rounded-lg">
                <section className="mb-8">
                    <button
                        onClick={() => setIsTocExpanded(!isTocExpanded)}
                        className="flex items-center justify-between w-full text-left text-lg font-medium mb-3 hover:text-gray-600 transition-colors"
                    >
                        Table of Contents
                        <span className="text-lg transform transition-transform duration-200">
                            {isTocExpanded ? '−' : '+'}
                        </span>
                    </button>
                    {isTocExpanded && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-base text-gray-700">
                            <div>
                                <h3 className="font-semibold mb-2">Getting Started</h3>
                                <ul className="list-disc pl-5 space-y-1">
                                    <li><a href="#how-to-play" className="text-blue-600 hover:text-blue-800">How to Play</a></li>
                                    <li><a href="#getting-started" className="text-blue-600 hover:text-blue-800">Getting Started</a></li>
                                    <li><a href="#making-moves" className="text-blue-600 hover:text-blue-800">Making Moves</a></li>
                                    <li><a href="#tips" className="text-blue-600 hover:text-blue-800">Tips</a></li>
                                    <li><a href="#game-progression" className="text-blue-600 hover:text-blue-800">Game Progression</a></li>
                                </ul>
                            </div>
                            <div>
                                <h3 className="font-semibold mb-2">Game Rules</h3>
                                <ul className="list-disc pl-5 space-y-1">
                                    <li><a href="#field-setup" className="text-blue-600 hover:text-blue-800">Field and Setup</a></li>
                                    <li><a href="#game-mechanics" className="text-blue-600 hover:text-blue-800">Game Mechanics</a></li>
                                    <li><a href="#conflict-resolution" className="text-blue-600 hover:text-blue-800">Conflict Resolution</a></li>
                                    <li><a href="#scoring-game-end" className="text-blue-600 hover:text-blue-800">Scoring and Game End</a></li>
                                    <li><a href="#elo-rating" className="text-blue-600 hover:text-blue-800">ELO Rating System</a></li>
                                    <li><a href="#strategy-tips" className="text-blue-600 hover:text-blue-800">Strategy Tips</a></li>
                                </ul>
                            </div>
                        </div>
                    )}
                </section>

                <section className="mb-8" id="how-to-play">
                    <h1 className="text-3xl font-semibold mb-4">How to Play</h1>

                    <h3 className="text-xl font-medium mt-4 mb-2" id="getting-started">Getting Started</h3>
                    <ol className="list-decimal pl-5 text-base text-gray-700">
                        <li><strong>Create or Join a Team</strong>: Register or log in to the TactiBall platform. You need crypto wallet to start, but you can create it in few clicks if you need.</li>
                        <li><strong>Find a Match</strong>: Navigate to the game lobby to find an opponent. Click "Play" and you will be matched with another player automatically, once another player is available.</li>
                        <li><strong>Invite friends</strong>: Share game into your feed, send a link to your friends, to always have someone to play with.</li>
                        <li><strong>Start the Game</strong>: Once both teams accept the match, the game begins. Team 1 starts with possession of the ball.</li>
                    </ol>

                    <h3 className="text-xl font-medium mt-4 mb-2" id="making-moves">Making Moves</h3>
                    <ol className="list-decimal pl-5 text-base text-gray-700">
                        <li><strong>Plan Your Moves</strong>: During your turn, select up to 6 players to make moves. Click on a player to see available move options based on their position and whether they have the ball.</li>
                        <li><strong>Choose Move Types</strong>:
                            <ul className="list-circle pl-5">
                                <li>Click to player to see available cells to do action. Click to player again to change move action type:</li>
                                <li><strong>RUN</strong> (orange cells): Move a player up to 2 cells in any direction. If they have the ball, it moves with them.</li>
                                <li><strong>PASS</strong> (blue cells): If a player has the ball, pass it up to 3 cells away to a teammate.</li>
                                <li><strong>SHOT</strong> (blue cells): If a player has the ball, attempt a shot towards the goal, up to 4 cells away.</li>
                                <li><strong>TACKLE</strong> (red cells): If a player doesn’t have the ball, attempt to steal it by moving 1 cell towards an opponent or staying in place to intercept.</li>
                            </ul>
                        </li>
                        <li><strong>Commit Moves</strong>: Once you've planned moves for your players, click the "Commit Moves" button. Your moves will be encrypted to ensure fairness.</li>
                        <li><strong>Wait for Opponent</strong>: After committing, wait for the opposing team to commit their moves. Both teams’ moves are revealed and resolved simultaneously.</li>
                        <li><strong>Review Results</strong>: Watch the animation of moves being executed. See the updated game state with new player and ball positions, and start your next move</li>
                    </ol>

                    <h3 className="text-xl font-medium mt-4 mb-2" id="tips">Tips</h3>
                    <ul className="list-disc pl-5 text-base text-gray-700">
                        <li><strong>Revert player move</strong>: Click on a moved player (more transparent) to revert back this player's action - works until you commit moves.</li>
                        <li>Click on any random cell to reset the player selection.</li>
                    </ul>

                    <h3 className="text-xl font-medium mt-4 mb-2" id="game-progression">Game Progression</h3>
                    <ul className="list-disc pl-5 text-base text-gray-700">
                        <li><strong>Turn Continuation</strong>: Repeat the move planning and commitment process for each turn until the game ends.</li>
                        <li><strong>Time Limit</strong>: Ensure you commit your moves within 30 seconds per turn, or your opponent can claim a victory by timeout.</li>
                        <li><strong>Game End</strong>: The game concludes after 45 moves or if a timeout occurs. The team with the most goals wins, or it’s a draw if scores are tied.</li>
                    </ul>
                </section>

                <section className="mb-8" id="game-rules">
                    <h1 className="text-3xl font-semibold mb-4">Game Rules</h1>
                    <p className="text-base text-gray-700">TactiBall is a strategic turn-based soccer game that combines football and chess mechanics. Two teams of 6 players each compete on a 15x11 grid field, with the objective of scoring goals by getting the ball into the opponent&apos;s goal area.</p>
                </section>

                <section className="mb-8" id="field-setup">
                    <h2 className="text-2xl font-semibold mb-4">Field and Setup</h2>

                    <h3 className="text-xl font-medium mt-4 mb-2">Field Dimensions</h3>
                    <ul className="list-disc pl-5 text-base text-gray-700">
                        <li><strong>Field Size</strong>: 15 cells wide × 11 cells high</li>
                        <li><strong>Goal Areas</strong>:
                            <ul className="list-circle pl-5">
                                <li>Team 1 goal: x=0, y=3-7 (left side)</li>
                                <li>Team 2 goal: x=16, y=3-7 (right side)</li>
                            </ul>
                        </li>
                        <li><strong>Field Coordinates</strong>: x=1-15, y=0-10</li>
                    </ul>

                    <h3 className="text-xl font-medium mt-4 mb-2">Team Formation</h3>
                    <p className="text-base text-gray-700">Each team consists of 6 players in a 2-2-1 formation:</p>
                    <ul className="list-disc pl-5 text-base text-gray-700">
                        <li><strong>1 Goalkeeper</strong> (Player 0)</li>
                        <li><strong>2 Defenders</strong> (Players 1-2)</li>
                        <li><strong>2 Midfielders</strong> (Players 3-4)</li>
                        <li><strong>1 Forward</strong> (Player 5)</li>
                    </ul>

                    <h3 className="text-xl font-medium mt-4 mb-2">Starting Positions</h3>
                    <p className="text-base text-gray-700"><strong>Team 1 (Left side):</strong></p>
                    <ul className="list-disc pl-5 text-base text-gray-700">
                        <li>Goalkeeper: (1, 5)</li>
                        <li>Defenders: (4, 2), (4, 8)</li>
                        <li>Midfielders: (6, 3), (6, 7)</li>
                        <li>Forward: (8, 5) - starts with ball</li>
                    </ul>
                    <p className="text-base text-gray-700 mt-2"><strong>Team 2 (Right side):</strong></p>
                    <ul className="list-disc pl-5 text-base text-gray-700">
                        <li>Goalkeeper: (15, 5)</li>
                        <li>Defenders: (12, 2), (12, 8)</li>
                        <li>Midfielders: (10, 2), (10, 8)</li>
                        <li>Forward: (10, 5)</li>
                    </ul>
                </section>

                <section className="mb-8" id="game-mechanics">
                    <h2 className="text-2xl font-semibold mb-4">Game Mechanics</h2>

                    <h3 className="text-xl font-medium mt-4 mb-2">Turn Structure</h3>
                    <ol className="list-decimal pl-5 text-base text-gray-700">
                        <li><strong>Simultaneous Move Planning</strong>: Both teams plan their moves simultaneously</li>
                        <li><strong>Move Commitment</strong>: Teams commit their encrypted moves</li>
                        <li><strong>Move Resolution</strong>: Game engine processes all moves and resolves conflicts</li>
                        <li><strong>State Update</strong>: New game state is calculated and broadcast</li>
                    </ol>

                    <h3 className="text-xl font-medium mt-4 mb-2">Move Types</h3>

                    <h4 className="text-lg font-medium mt-3 mb-1">1. RUN</h4>
                    <ul className="list-disc pl-5 text-base text-gray-700">
                        <li><strong>Distance</strong>: 2 cells in any direction (including diagonals)</li>
                        <li><strong>Purpose</strong>: Move a player to a new position</li>
                        <li><strong>Ball Interaction</strong>: If player has ball, ball moves with player</li>
                        <li><strong>Availability</strong>: All players can always run</li>
                    </ul>

                    <h4 className="text-lg font-medium mt-3 mb-1">2. PASS</h4>
                    <ul className="list-disc pl-5 text-base text-gray-700">
                        <li><strong>Distance</strong>: 3 cells in any direction (including diagonals)</li>
                        <li><strong>Purpose</strong>: Pass the ball to a teammate</li>
                        <li><strong>Requirements</strong>: Player must have possession of the ball</li>
                        <li><strong>Ball Movement</strong>: Ball travels to target position, player stays in place</li>
                        <li><strong>Availability</strong>: Only when player has ball</li>
                    </ul>

                    <h4 className="text-lg font-medium mt-3 mb-1">3. TACKLE</h4>
                    <ul className="list-disc pl-5 text-base text-gray-700">
                        <li><strong>Distance</strong>: 1 cell in any direction (including diagonals)</li>
                        <li><strong>Purpose</strong>: Attempt to steal the ball from opponent</li>
                        <li><strong>Requirements</strong>: Player must not have the ball</li>
                        <li><strong>Special Rule</strong>: Can stay in current position (distance 0)</li>
                        <li><strong>Availability</strong>: Only when player doesn&apos;t have ball</li>
                    </ul>

                    <h4 className="text-lg font-medium mt-3 mb-1">4. SHOT</h4>
                    <ul className="list-disc pl-5 text-base text-gray-700">
                        <li><strong>Distance</strong>: 4 cells in any direction (including diagonals)</li>
                        <li><strong>Purpose</strong>: Shoot the ball toward the goal</li>
                        <li><strong>Requirements</strong>: Player must have possession of the ball</li>
                        <li><strong>Ball Movement</strong>: Ball travels to target position, player stays in place</li>
                        <li><strong>Goal Scoring</strong>: If ball reaches goal area, team scores</li>
                        <li><strong>Availability</strong>: Only when player has ball</li>
                    </ul>

                    <h3 className="text-xl font-medium mt-4 mb-2">Movement Rules</h3>

                    <h4 className="text-lg font-medium mt-3 mb-1">Path Calculation</h4>
                    <ul className="list-disc pl-5 text-base text-gray-700">
                        <li>All moves follow straight-line paths (including diagonals)</li>
                        <li>Path is calculated step-by-step from origin to destination</li>
                        <li>Movement stops if path goes out of bounds</li>
                    </ul>

                    <h4 className="text-lg font-medium mt-3 mb-1">Collision Detection</h4>
                    <ul className="list-disc pl-5 text-base text-gray-700">
                        <li>Players cannot occupy the same cell</li>
                        <li>Two players from the same team cannot move to the same cell</li>
                        <li>Ball and player can occupy the same cell (possession)</li>
                    </ul>

                    <h4 className="text-lg font-medium mt-3 mb-1">Ball Possession</h4>
                    <ul className="list-disc pl-5 text-base text-gray-700">
                        <li>Only one player can have the ball at any time</li>
                        <li>Ball moves with the player who has it</li>
                        <li>Ball changes possession when:
                            <ul className="list-circle pl-5">
                                <li>Player with ball moves (RUN)</li>
                                <li>Ball is passed to another player (PASS)</li>
                                <li>Ball is shot (SHOT)</li>
                                <li>Opponent successfully tackles (TACKLE)</li>
                            </ul>
                        </li>
                    </ul>
                </section>

                <section className="mb-8" id="conflict-resolution">
                    <h2 className="text-2xl font-semibold mb-4">Conflict Resolution</h2>

                    <h3 className="text-xl font-medium mt-4 mb-2">Ball Contests</h3>
                    <p className="text-base text-gray-700">When two players from different teams end up on the same cell with the ball:</p>
                    <ol className="list-decimal pl-5 text-base text-gray-700">
                        <li><strong>Tackle vs Ball Holder</strong>: Tackle always wins</li>
                        <li><strong>Tackle vs Tackle</strong>: When two players both attempt to tackle during a pass, random resolution (50/50 chance)</li>
                        <li><strong>Other Conflicts</strong>: Random resolution (50/50 chance)</li>
                        <li><strong>Winner Takes Ball</strong>: Winning player gains possession</li>
                        <li><strong>Ball Stops Moving</strong>: If ball is intercepted, it stops at that position</li>
                    </ol>

                    <h3 className="text-xl font-medium mt-4 mb-2">Move Validation</h3>
                    <ul className="list-disc pl-5 text-base text-gray-700">
                        <li>All moves must be within field bounds</li>
                        <li>Players cannot move to occupied cells (except tackles)</li>
                        <li>Move distances must match move type requirements</li>
                        <li>Each player can only make one move per turn</li>
                    </ul>
                </section>

                <section className="mb-8" id="scoring-game-end">
                    <h2 className="text-2xl font-semibold mb-4">Scoring and Game End</h2>

                    <h3 className="text-xl font-medium mt-4 mb-2">Goal Scoring</h3>
                    <ul className="list-disc pl-5 text-base text-gray-700">
                        <li><strong>Goal Condition</strong>: Ball reaches opponent&apos;s goal area</li>
                        <li><strong>Goal Areas</strong>:
                            <ul className="list-circle pl-5">
                                <li>Team 1 goal: x=0, y=3-7</li>
                                <li>Team 2 goal: x=16, y=3-7</li>
                            </ul>
                        </li>
                        <li><strong>After Goal</strong>: Teams reset to starting positions, scoring team gets ball</li>
                    </ul>

                    <h3 className="text-xl font-medium mt-4 mb-2">Game End Conditions</h3>
                    <ol className="list-decimal pl-5 text-base text-gray-700">
                        <li><strong>Maximum Moves</strong>: Game ends after 45 moves total</li>
                        <li><strong>Timeout</strong>: Game ends if a team doesn&apos;t commit moves within 1 minute</li>
                        <li><strong>Winner Determination</strong>:
                            <ul className="list-circle pl-5">
                                <li>Most goals scored wins</li>
                                <li>If tied after 45 moves, game is a draw</li>
                                <li>Timeout winner is determined by last team to move</li>
                            </ul>
                        </li>
                    </ol>

                    <h3 className="text-xl font-medium mt-4 mb-2">Scoring System</h3>
                    <ul className="list-disc pl-5 text-base text-gray-700">
                        <li><strong>Normal Goal</strong>: 1 point</li>
                        <li><strong>Timeout Win</strong>: 3 points (technical victory)</li>
                        <li><strong>Draw</strong>: 0 points for both teams</li>
                    </ul>
                </section>

                <section className="mb-8" id="elo-rating">
                    <h2 className="text-2xl font-semibold mb-4">ELO Rating System</h2>

                    <h3 className="text-xl font-medium mt-4 mb-2">Rating Updates</h3>
                    <ul className="list-disc pl-5 text-base text-gray-700">
                        <li>ELO ratings are updated after each completed game</li>
                        <li>Starting ELO: 10,000 points</li>
                        <li>Minimum ELO: 5,000 points</li>
                        <li>K-factor: 20</li>
                    </ul>

                    <h3 className="text-xl font-medium mt-4 mb-2">Rating Calculation</h3>
                    <ul className="list-disc pl-5 text-base text-gray-700">
                        <li>Win: +ELO points</li>
                        <li>Loss: -ELO points</li>
                        <li>Draw: Minimal change</li>
                        <li>Rating changes based on opponent&apos;s ELO rating</li>
                    </ul>
                </section>

                <section className="mb-8">
                    <h2 className="text-2xl font-semibold mb-4">Game Flow</h2>

                    <h3 className="text-xl font-medium mt-4 mb-2">1. Game Creation</h3>
                    <ul className="list-disc pl-5 text-base text-gray-700">
                        <li>Team 1 creates game request</li>
                        <li>Team 2 accepts request</li>
                        <li>Game starts with Team 1 having ball</li>
                    </ul>

                    <h3 className="text-xl font-medium mt-4 mb-2">2. Turn Sequence</h3>
                    <ol className="list-decimal pl-5 text-base text-gray-700">
                        <li>Both teams plan moves simultaneously</li>
                        <li>Teams commit encrypted moves</li>
                        <li>Game engine processes moves</li>
                        <li>New state is calculated and broadcast</li>
                        <li>Process repeats until game end</li>
                    </ol>

                    <h3 className="text-xl font-medium mt-4 mb-2">3. Move Planning</h3>
                    <ul className="list-disc pl-5 text-base text-gray-700">
                        <li>Teams can plan multiple player moves per turn</li>
                        <li>Each player can make one move per turn</li>
                        <li>Moves are encrypted until both teams commit</li>
                        <li>Teams cannot see opponent&apos;s moves until resolution</li>
                    </ul>

                    <h3 className="text-xl font-medium mt-4 mb-2">4. State Broadcasting</h3>
                    <ul className="list-disc pl-5 text-base text-gray-700">
                        <li>Game state changes are broadcast in real-time</li>
                        <li>Includes player positions, ball position, scores</li>
                        <li>Move animations show step-by-step movement</li>
                        <li>Goal celebrations and position resets are shown</li>
                    </ul>
                </section>

                <section className="mb-8">
                    <h2 className="text-2xl font-semibold mb-4">Technical Rules</h2>

                    <h3 className="text-xl font-medium mt-4 mb-2">Move Encryption</h3>
                    <ul className="list-disc pl-5 text-base text-gray-700">
                        <li>All moves are encrypted before commitment</li>
                        <li>Encryption key is generated at game start</li>
                        <li>Moves are decrypted only during processing</li>
                        <li>Ensures fair play and prevents cheating</li>
                    </ul>

                    <h3 className="text-xl font-medium mt-4 mb-2">Move Serialization</h3>
                    <ul className="list-disc pl-5 text-base text-gray-700">
                        <li>Moves are serialized as 10-digit sequences</li>
                        <li>Format: PlayerID + MoveType + OldX + OldY + NewX + NewY</li>
                        <li>Maximum 6 moves per team per turn</li>
                        <li>All moves must be valid before processing</li>
                    </ul>

                    <h3 className="text-xl font-medium mt-4 mb-2">Error Handling</h3>
                    <ul className="list-disc pl-5 text-base text-gray-700">
                        <li>Invalid moves result in team penalty</li>
                        <li>Move validation errors skip the offending team&apos;s turn</li>
                        <li>Game continues with valid moves only</li>
                        <li>Error details are logged for debugging</li>
                    </ul>
                </section>

                <section className="mb-8" id="strategy-tips">
                    <h2 className="text-2xl font-semibold mb-4">Strategy Tips</h2>

                    <h3 className="text-xl font-medium mt-4 mb-2">Offensive Strategy</h3>
                    <ul className="list-disc pl-5 text-base text-gray-700">
                        <li>Use RUN to advance players toward goal</li>
                        <li>PASS to maintain possession and create opportunities</li>
                        <li>SHOT when in range of goal area</li>
                        <li>Coordinate multiple players for complex plays</li>
                    </ul>

                    <h3 className="text-xl font-medium mt-4 mb-2">Defensive Strategy</h3>
                    <ul className="list-disc pl-5 text-base text-gray-700">
                        <li>Use TACKLE to disrupt opponent&apos;s ball movement</li>
                        <li>Position players to block passing lanes</li>
                        <li>Use RUN to cover defensive positions</li>
                        <li>Anticipate opponent&apos;s moves</li>
                    </ul>

                    <h3 className="text-xl font-medium mt-4 mb-2">Ball Control</h3>
                    <ul className="list-disc pl-5 text-base text-gray-700">
                        <li>Keep ball moving to avoid tackles</li>
                        <li>Use short passes to maintain possession</li>
                        <li>Long passes for quick attacks</li>
                        <li>Shots for direct goal attempts</li>
                    </ul>
                </section>

                <p className="text-base text-gray-700 mt-6">This comprehensive rule set covers all the mechanics of TactiBall, providing players with a complete understanding of how to play strategically and effectively.</p>
            </div>
        </div>
    );
}
