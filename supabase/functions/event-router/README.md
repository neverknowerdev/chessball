# Contract Events Edge Function

This Supabase Edge Function handles smart contract events from the TactiBall game contract and processes them according to the specified business logic.

## Overview

The function receives webhook events from a blockchain indexing service (like The Graph) and processes smart contract events to:

1. **Update the database** with new teams, games, and game states
2. **Broadcast real-time updates** to connected clients via Ably WebSocket channels
3. **Handle all game-related events** according to the contract specification

## Supported Events

### Team Events
- `TeamCreated` - Creates new team records and broadcasts to team channel

### Game Request Events
- `GameRequestCreated` - Broadcasts to general game requests channel
- `GameRequestCancelled` - Broadcasts to both team channels

### Game Events
- `GameStarted` - Creates new game record, updates teams, creates game channel, broadcasts to all relevant channels
- `gameActionCommitted` - Broadcasts game action to game channel
- `NewGameState` - Updates game history and broadcasts new state to game channel
- `GameFinished` - Updates game status, removes active game from teams, broadcasts to all channels

## Channel Structure

The function uses the following channel naming convention with Ably:

- **Team channels**: `team_{teamId}` - For team-specific updates
- **Game channels**: `game_{gameId}` - For game-specific updates
- **General channels**: `game_requests` - For general game request updates

## Database Operations

### Teams Table
- Insert new teams with wallet address, name, and country
- Update active game ID when games start/finish

### Games Table
- Insert new games with team IDs and initial state
- Update game history with new states
- Mark games as finished with winner and reason

## Smart Contract Integration

The function integrates directly with the smart contract to retrieve the latest game state:

### `handleNewGameState` Function
- **Calls Smart Contract**: Uses `viem` to call the `getGame(gameId)` function
- **Gets Latest State**: Retrieves complete current game state from the blockchain
- **Maps Data Structure**: Converts smart contract data to database-friendly format
- **Updates Database**: Stores new state in `history` array and updates scores
- **Broadcasts Updates**: Sends real-time updates via Ably WebSockets
- **Error Handling**: Falls back to simplified state if contract call fails

### Data Mapping
The function maps these smart contract fields to your database:
- **Game Status**: `status` → `status` (active/finished/finished_by_timeout)
- **Scores**: `team1Score`/`team2Score` → `team1_score`/`team2_score`
- **Move Count**: `movesMade` → `moves_made`
- **Winner**: `winner` → `winner`
- **Positions**: Team and ball positions stored in `history` array
- **Game State**: Complete state data stored in `history` array

## WebSocket Broadcasting with Ably

The function uses Ably WebSockets to broadcast messages to connected clients. Each message includes:

- `type`: Event type identifier
- `timestamp`: Unix timestamp in milliseconds
- Event-specific data fields

### Ably Integration
- Uses Ably Realtime client for WebSocket connections
- Automatically manages connections and reconnections
- Publishes messages to specific channels using the `game-event` event type
- Properly closes connections after each webhook processing

## Deployment

### Prerequisites

1. Supabase project with database tables set up
2. Service role key with admin permissions
3. Ably account with API key

### Environment Variables

Set these in your Supabase project:

```bash
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
ABLY_API_KEY=your_ably_api_key
CONTRACT_ADDRESS=0x08011cd93f958a01d8bF10CC6aAe507cA629b95C
RPC_URL=https://mainnet.base.org
```

**Notes**: 
- The `CONTRACT_ADDRESS` is required for the `handleNewGameState` function to call the smart contract's `getGame` function and retrieve the latest game state.
- The `RPC_URL` is required for the Edge Function to connect to the Base blockchain. You can use public RPCs like `https://mainnet.base.org` or your own RPC endpoint for better performance.

### Deploy Command

```bash
supabase functions deploy contract-events
```

## Database Schema Requirements

### Teams Table
```sql
CREATE TABLE teams (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP DEFAULT NOW(),
    primaryWallet VARCHAR,
    name VARCHAR,
    country SMALLINT,
    game_request_id INTEGER,
    active_game_id INTEGER,
    eloRating NUMERIC DEFAULT '100'::NUMERIC
);
```

### Games Table
```sql
CREATE TABLE games (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP DEFAULT NOW(),
    last_move_at TIMESTAMP,
    last_move_team BIGINT,
    team1 BIGINT,
    team2 BIGINT,
    status game_status DEFAULT 'active',
    moves_made INTEGER DEFAULT 0,
    winner BIGINT,
    history JSONB,
    team1_info JSONB DEFAULT '{}'::JSONB,
    team2_info JSONB DEFAULT '{}'::JSONB,
    team1_score SMALLINT DEFAULT '0'::SMALLINT,
    team2_score SMALLINT DEFAULT '0'::SMALLINT
);
```

## Webhook Configuration

Configure your blockchain indexing service to send POST requests to:

```
https://your-project-ref.supabase.co/functions/v1/contract-events
```

The webhook should include the full event data in the format specified in the interface.

## Client-Side Ably Integration

To receive real-time updates, clients should subscribe to Ably channels:

```typescript
import Ably from 'ably'

const ably = new Ably.Realtime('your-ably-api-key')

// Subscribe to team updates
const teamChannel = ably.channels.get('team_123')
teamChannel.subscribe('game-event', (message) => {
  console.log('Team update:', message.data)
})

// Subscribe to game updates
const gameChannel = ably.channels.get('game_456')
gameChannel.subscribe('game-event', (message) => {
  console.log('Game update:', message.data)
})

// Subscribe to general updates
const generalChannel = ably.channels.get('game_requests')
generalChannel.subscribe('game-event', (message) => {
  console.log('General update:', message.data)
})
```

## Error Handling

The function includes comprehensive error handling:

- Logs all errors for debugging
- Returns appropriate HTTP status codes
- Continues processing other events if one fails
- Gracefully handles malformed event data
- Always closes Ably connections to prevent resource leaks

## Monitoring

Monitor the function through:

1. **Supabase Dashboard** - Function logs and metrics
2. **Database queries** - Check for successful event processing
3. **Ably Dashboard** - Monitor WebSocket connections and message delivery
4. **Function execution logs** - Check for processing errors

## Testing

Test the function by:

1. Sending sample webhook payloads
2. Verifying database updates
3. Checking Ably WebSocket broadcasts
4. Monitoring function execution logs

## Security Considerations

- Uses service role key for admin database operations
- Validates incoming webhook data
- Sanitizes all database inputs
- Implements proper error handling to prevent information leakage
- Ably API key should have appropriate permissions (publish only)

## Performance

The function is designed for:

- **Low latency** - Processes events as they arrive
- **High throughput** - Handles multiple events per block
- **Scalability** - Can be scaled horizontally if needed
- **Reliability** - Continues processing even if individual events fail
- **Resource management** - Properly closes WebSocket connections

## Ably Setup

1. Create an Ably account at [ably.com](https://ably.com)
2. Create a new app in your Ably dashboard
3. Copy the API key (you'll need the full key, not just the app key)
4. Set the `ABLY_API_KEY` environment variable in your Supabase project
5. Ensure your Ably app has appropriate permissions for publishing messages
