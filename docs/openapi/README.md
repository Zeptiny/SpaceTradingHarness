# SpaceTraders API — OpenAPI Reference

- **Spec version:** 3.0.1
- **API version:** v2.3.0
- **Title:** SpaceTraders API
- **Base URL:** https://api.spacetraders.io/v2
- **Source:** https://api.spacetraders.io/v2/documentation/json

## Overview

SpaceTraders is an open-universe game and learning platform that offers a set of HTTP endpoints to control a fleet of ships and explore a multiplayer universe.

The API is documented using [OpenAPI](https://github.com/SpaceTradersAPI/api-docs). You can send your first request right here in your browser to check the status of the game server.

```json http
{
  "method": "GET",
  "url": "https://api.spacetraders.io/v2",
}
```

Unlike a traditional game, SpaceTraders does not have a first-party client or app to play the game. Instead, you can use the API to build your own client, write a script to automate your ships, or try an app built by the community.

We have a [Discord channel](https://discord.com/invite/jh6zurdWk5) where you can share your projects, ask questions, and get help from other players.

## Route Index

### Factions (3)

| Method | Path | Summary | Doc |
|---|---|---|---|
| GET | `/factions` | List factions | [link](./routes/Factions/get-factions.md) |
| GET | `/factions/{factionSymbol}` | Faction details | [link](./routes/Factions/get-faction.md) |
| GET | `/my/factions` | Get My Factions | [link](./routes/Factions/get-my-factions.md) |

### Agents (4)

| Method | Path | Summary | Doc |
|---|---|---|---|
| GET | `/agents` | List all public agent details. | [link](./routes/Agents/get-agents.md) |
| GET | `/agents/{agentSymbol}` | Get public details for a specific agent. | [link](./routes/Agents/get-agent.md) |
| GET | `/my/agent` | Get Agent | [link](./routes/Agents/get-my-agent.md) |
| GET | `/my/agent/events` | Get Agent Events | [link](./routes/Agents/get-my-agent-events.md) |

### Data (2)

| Method | Path | Summary | Doc |
|---|---|---|---|
| GET | `/market/supply-chain` | Describes trade relationships | [link](./routes/Data/get-supply-chain.md) |
| GET | `/my/socket.io` | Subscribe to events | [link](./routes/Data/websocket-departure-events.md) |

### Global (2)

| Method | Path | Summary | Doc |
|---|---|---|---|
| GET | `/` | Server status | [link](./routes/Global/get-status.md) |
| GET | `/error-codes` | Error code list | [link](./routes/Global/get-error-codes.md) |

### Systems (9)

| Method | Path | Summary | Doc |
|---|---|---|---|
| GET | `/systems` | List Systems | [link](./routes/Systems/get-systems.md) |
| GET | `/systems/{systemSymbol}` | Get System | [link](./routes/Systems/get-system.md) |
| GET | `/systems/{systemSymbol}/waypoints` | List Waypoints in System | [link](./routes/Systems/get-system-waypoints.md) |
| GET | `/systems/{systemSymbol}/waypoints/{waypointSymbol}` | Get Waypoint | [link](./routes/Systems/get-waypoint.md) |
| GET | `/systems/{systemSymbol}/waypoints/{waypointSymbol}/construction` | Get Construction Site | [link](./routes/Systems/get-construction.md) |
| POST | `/systems/{systemSymbol}/waypoints/{waypointSymbol}/construction/supply` | Supply Construction Site | [link](./routes/Systems/supply-construction.md) |
| GET | `/systems/{systemSymbol}/waypoints/{waypointSymbol}/market` | Get Market | [link](./routes/Systems/get-market.md) |
| GET | `/systems/{systemSymbol}/waypoints/{waypointSymbol}/jump-gate` | Get Jump Gate | [link](./routes/Systems/get-jump-gate.md) |
| GET | `/systems/{systemSymbol}/waypoints/{waypointSymbol}/shipyard` | Get Shipyard | [link](./routes/Systems/get-shipyard.md) |

### Contracts (5)

| Method | Path | Summary | Doc |
|---|---|---|---|
| GET | `/my/contracts` | List Contracts | [link](./routes/Contracts/get-contracts.md) |
| GET | `/my/contracts/{contractId}` | Get Contract | [link](./routes/Contracts/get-contract.md) |
| POST | `/my/contracts/{contractId}/accept` | Accept Contract | [link](./routes/Contracts/accept-contract.md) |
| POST | `/my/contracts/{contractId}/fulfill` | Fulfill Contract | [link](./routes/Contracts/fulfill-contract.md) |
| POST | `/my/contracts/{contractId}/deliver` | Deliver Cargo to Contract | [link](./routes/Contracts/deliver-contract.md) |

### Fleet (37)

| Method | Path | Summary | Doc |
|---|---|---|---|
| GET | `/my/ships` | List Ships | [link](./routes/Fleet/get-my-ships.md) |
| POST | `/my/ships` | Purchase Ship | [link](./routes/Fleet/purchase-ship.md) |
| GET | `/my/ships/{shipSymbol}` | Get Ship | [link](./routes/Fleet/get-my-ship.md) |
| POST | `/my/ships/{shipSymbol}/chart` | Create Chart | [link](./routes/Fleet/create-chart.md) |
| POST | `/my/ships/{shipSymbol}/negotiate/contract` | Negotiate Contract | [link](./routes/Fleet/negotiate-contract.md) |
| GET | `/my/ships/{shipSymbol}/cooldown` | Get Ship Cooldown | [link](./routes/Fleet/get-ship-cooldown.md) |
| POST | `/my/ships/{shipSymbol}/dock` | Dock Ship | [link](./routes/Fleet/dock-ship.md) |
| POST | `/my/ships/{shipSymbol}/extract` | Extract Resources | [link](./routes/Fleet/extract-resources.md) |
| POST | `/my/ships/{shipSymbol}/extract/survey` | Extract Resources with Survey | [link](./routes/Fleet/extract-resources-with-survey.md) |
| POST | `/my/ships/{shipSymbol}/jettison` | Jettison Cargo | [link](./routes/Fleet/jettison.md) |
| POST | `/my/ships/{shipSymbol}/jump` | Jump Ship | [link](./routes/Fleet/jump-ship.md) |
| POST | `/my/ships/{shipSymbol}/scan/systems` | Scan Systems | [link](./routes/Fleet/create-ship-system-scan.md) |
| POST | `/my/ships/{shipSymbol}/scan/waypoints` | Scan Waypoints | [link](./routes/Fleet/create-ship-waypoint-scan.md) |
| POST | `/my/ships/{shipSymbol}/scan/ships` | Scan Ships | [link](./routes/Fleet/create-ship-ship-scan.md) |
| GET | `/my/ships/{shipSymbol}/scrap` | Get Scrap Ship | [link](./routes/Fleet/get-scrap-ship.md) |
| POST | `/my/ships/{shipSymbol}/scrap` | Scrap Ship | [link](./routes/Fleet/scrap-ship.md) |
| POST | `/my/ships/{shipSymbol}/navigate` | Navigate Ship | [link](./routes/Fleet/navigate-ship.md) |
| POST | `/my/ships/{shipSymbol}/warp` | Warp Ship | [link](./routes/Fleet/warp-ship.md) |
| POST | `/my/ships/{shipSymbol}/orbit` | Orbit Ship | [link](./routes/Fleet/orbit-ship.md) |
| POST | `/my/ships/{shipSymbol}/purchase` | Purchase Cargo | [link](./routes/Fleet/purchase-cargo.md) |
| POST | `/my/ships/{shipSymbol}/refine` | Ship Refine | [link](./routes/Fleet/ship-refine.md) |
| POST | `/my/ships/{shipSymbol}/refuel` | Refuel Ship | [link](./routes/Fleet/refuel-ship.md) |
| GET | `/my/ships/{shipSymbol}/repair` | Get Repair Ship | [link](./routes/Fleet/get-repair-ship.md) |
| POST | `/my/ships/{shipSymbol}/repair` | Repair Ship | [link](./routes/Fleet/repair-ship.md) |
| POST | `/my/ships/{shipSymbol}/sell` | Sell Cargo | [link](./routes/Fleet/sell-cargo.md) |
| POST | `/my/ships/{shipSymbol}/siphon` | Siphon Resources | [link](./routes/Fleet/siphon-resources.md) |
| POST | `/my/ships/{shipSymbol}/survey` | Create Survey | [link](./routes/Fleet/create-survey.md) |
| POST | `/my/ships/{shipSymbol}/transfer` | Transfer Cargo | [link](./routes/Fleet/transfer-cargo.md) |
| GET | `/my/ships/{shipSymbol}/cargo` | Get Ship Cargo | [link](./routes/Fleet/get-my-ship-cargo.md) |
| GET | `/my/ships/{shipSymbol}/modules` | Get Ship Modules | [link](./routes/Fleet/get-ship-modules.md) |
| POST | `/my/ships/{shipSymbol}/modules/install` | Install Ship Module | [link](./routes/Fleet/install-ship-module.md) |
| POST | `/my/ships/{shipSymbol}/modules/remove` | Remove Ship Module | [link](./routes/Fleet/remove-ship-module.md) |
| GET | `/my/ships/{shipSymbol}/mounts` | Get Mounts | [link](./routes/Fleet/get-mounts.md) |
| POST | `/my/ships/{shipSymbol}/mounts/install` | Install Mount | [link](./routes/Fleet/install-mount.md) |
| POST | `/my/ships/{shipSymbol}/mounts/remove` | Remove Mount | [link](./routes/Fleet/remove-mount.md) |
| GET | `/my/ships/{shipSymbol}/nav` | Get Ship Nav | [link](./routes/Fleet/get-ship-nav.md) |
| PATCH | `/my/ships/{shipSymbol}/nav` | Patch Ship Nav | [link](./routes/Fleet/patch-ship-nav.md) |

### Accounts (2)

| Method | Path | Summary | Doc |
|---|---|---|---|
| GET | `/my/account` | Get Account | [link](./routes/Accounts/get-my-account.md) |
| POST | `/register` | Register New Agent | [link](./routes/Accounts/register.md) |

## Schemas

78 component schemas under [`schemas/`](./schemas/):

- [`ActivityLevel`](./schemas/ActivityLevel.md)
- [`Agent`](./schemas/Agent.md)
- [`AgentEvent`](./schemas/AgentEvent.md)
- [`Chart`](./schemas/Chart.md)
- [`ChartTransaction`](./schemas/ChartTransaction.md)
- [`Construction`](./schemas/Construction.md)
- [`ConstructionMaterial`](./schemas/ConstructionMaterial.md)
- [`Contract`](./schemas/Contract.md)
- [`ContractDeliverGood`](./schemas/ContractDeliverGood.md)
- [`ContractPayment`](./schemas/ContractPayment.md)
- [`ContractTerms`](./schemas/ContractTerms.md)
- [`Cooldown`](./schemas/Cooldown.md)
- [`Extraction`](./schemas/Extraction.md)
- [`ExtractionYield`](./schemas/ExtractionYield.md)
- [`Faction`](./schemas/Faction.md)
- [`FactionSymbol`](./schemas/FactionSymbol.md)
- [`FactionTrait`](./schemas/FactionTrait.md)
- [`FactionTraitSymbol`](./schemas/FactionTraitSymbol.md)
- [`JumpGate`](./schemas/JumpGate.md)
- [`Market`](./schemas/Market.md)
- [`MarketTradeGood`](./schemas/MarketTradeGood.md)
- [`MarketTransaction`](./schemas/MarketTransaction.md)
- [`Meta`](./schemas/Meta.md)
- [`PublicAgent`](./schemas/PublicAgent.md)
- [`RepairTransaction`](./schemas/RepairTransaction.md)
- [`ScannedShip`](./schemas/ScannedShip.md)
- [`ScannedSystem`](./schemas/ScannedSystem.md)
- [`ScannedWaypoint`](./schemas/ScannedWaypoint.md)
- [`ScrapTransaction`](./schemas/ScrapTransaction.md)
- [`Ship`](./schemas/Ship.md)
- [`ShipCargo`](./schemas/ShipCargo.md)
- [`ShipCargoItem`](./schemas/ShipCargoItem.md)
- [`ShipComponentCondition`](./schemas/ShipComponentCondition.md)
- [`ShipComponentIntegrity`](./schemas/ShipComponentIntegrity.md)
- [`ShipComponentQuality`](./schemas/ShipComponentQuality.md)
- [`ShipConditionEvent`](./schemas/ShipConditionEvent.md)
- [`ShipCrew`](./schemas/ShipCrew.md)
- [`ShipEngine`](./schemas/ShipEngine.md)
- [`ShipFrame`](./schemas/ShipFrame.md)
- [`ShipFuel`](./schemas/ShipFuel.md)
- [`ShipModificationTransaction`](./schemas/ShipModificationTransaction.md)
- [`ShipModule`](./schemas/ShipModule.md)
- [`ShipMount`](./schemas/ShipMount.md)
- [`ShipNav`](./schemas/ShipNav.md)
- [`ShipNavFlightMode`](./schemas/ShipNavFlightMode.md)
- [`ShipNavRoute`](./schemas/ShipNavRoute.md)
- [`ShipNavRouteWaypoint`](./schemas/ShipNavRouteWaypoint.md)
- [`ShipNavStatus`](./schemas/ShipNavStatus.md)
- [`ShipReactor`](./schemas/ShipReactor.md)
- [`ShipRegistration`](./schemas/ShipRegistration.md)
- [`ShipRequirements`](./schemas/ShipRequirements.md)
- [`ShipRole`](./schemas/ShipRole.md)
- [`ShipType`](./schemas/ShipType.md)
- [`Shipyard`](./schemas/Shipyard.md)
- [`ShipyardShip`](./schemas/ShipyardShip.md)
- [`ShipyardTransaction`](./schemas/ShipyardTransaction.md)
- [`Siphon`](./schemas/Siphon.md)
- [`SiphonYield`](./schemas/SiphonYield.md)
- [`SupplyLevel`](./schemas/SupplyLevel.md)
- [`Survey`](./schemas/Survey.md)
- [`SurveyDeposit`](./schemas/SurveyDeposit.md)
- [`SurveySize`](./schemas/SurveySize.md)
- [`System`](./schemas/System.md)
- [`SystemFaction`](./schemas/SystemFaction.md)
- [`SystemSymbol`](./schemas/SystemSymbol.md)
- [`SystemType`](./schemas/SystemType.md)
- [`SystemWaypoint`](./schemas/SystemWaypoint.md)
- [`TradeGood`](./schemas/TradeGood.md)
- [`TradeSymbol`](./schemas/TradeSymbol.md)
- [`Waypoint`](./schemas/Waypoint.md)
- [`WaypointFaction`](./schemas/WaypointFaction.md)
- [`WaypointModifier`](./schemas/WaypointModifier.md)
- [`WaypointModifierSymbol`](./schemas/WaypointModifierSymbol.md)
- [`WaypointOrbital`](./schemas/WaypointOrbital.md)
- [`WaypointSymbol`](./schemas/WaypointSymbol.md)
- [`WaypointTrait`](./schemas/WaypointTrait.md)
- [`WaypointTraitSymbol`](./schemas/WaypointTraitSymbol.md)
- [`WaypointType`](./schemas/WaypointType.md)
