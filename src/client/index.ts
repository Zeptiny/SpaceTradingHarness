import { transport } from "../transport/http.js";
import type * as T from "../generated/types.js";

// Thin typed wrappers: URL + params only, zero logic. All shapes come from src/generated.

export const api = {
  status: () => transport.request<T.getStatusResponse>("getStatus"),

  // Agent
  myAgent: () => transport.request<T.getMyAgentResponse>("getMyAgent"),
  agentEvents: (limit = 20) =>
    transport.request<T.getMyAgentEventsResponse>("getMyAgentEvents", { query: { limit } }),

  // Fleet — reads
  listShips: (limit = 20, page = 1) =>
    transport.request<T.Ship[]>("getMyShips", { query: { limit, page } }),
  getShip: (shipSymbol: string) =>
    transport.request<T.getMyShipResponse>("getMyShip", { path: { shipSymbol } }),
  getShipCooldown: (shipSymbol: string) =>
    transport.request<T.getShipCooldownResponse>("getShipCooldown", { path: { shipSymbol } }),

  // Fleet — navigation
  orbit: (shipSymbol: string) =>
    transport.request<T.orbitShipResponse>("orbitShip", { path: { shipSymbol } }),
  dock: (shipSymbol: string) =>
    transport.request<T.dockShipResponse>("dockShip", { path: { shipSymbol } }),
  navigate: (shipSymbol: string, waypointSymbol: string) =>
    transport.request<T.navigateShipResponse>("navigateShip", {
      path: { shipSymbol },
      body: { waypointSymbol },
    }),
  patchNav: (shipSymbol: string, flightMode: T.ShipNavFlightMode) =>
    transport.request<T.patchShipNavResponse>("patchShipNav", { path: { shipSymbol }, body: { flightMode } }),
  warp: (shipSymbol: string, waypointSymbol: string) =>
    transport.request<T.warpShipResponse>("warpShip", { path: { shipSymbol }, body: { waypointSymbol } }),
  jump: (shipSymbol: string, waypointSymbol: string) =>
    transport.request<T.jumpShipResponse>("jumpShip", { path: { shipSymbol }, body: { waypointSymbol } }),

  // Fleet — resources
  extract: (shipSymbol: string, survey?: T.Survey) =>
    transport.request<T.extractResourcesResponse>("extractResources", {
      path: { shipSymbol },
      body: survey ? { survey } : {},
    }),
  extractWithSurvey: (shipSymbol: string, survey: T.Survey) =>
    transport.request<T.extractResourcesWithSurveyResponse>("extractResourcesWithSurvey", {
      path: { shipSymbol },
      body: { survey },
    }),
  siphon: (shipSymbol: string) =>
    transport.request<T.siphonResourcesResponse>("siphonResources", { path: { shipSymbol } }),
  createSurvey: (shipSymbol: string) =>
    transport.request<T.createSurveyResponse>("createSurvey", { path: { shipSymbol } }),

  // Fleet — cargo & economy
  refuel: (shipSymbol: string) =>
    transport.request<T.refuelShipResponse>("refuelShip", { path: { shipSymbol } }),
  purchaseCargo: (shipSymbol: string, symbol: string, units: number) =>
    transport.request<T.purchaseCargoResponse>("purchaseCargo", { path: { shipSymbol }, body: { symbol, units } }),
  sellCargo: (shipSymbol: string, symbol: string, units: number) =>
    transport.request<T.sellCargoResponse>("sellCargo", { path: { shipSymbol }, body: { symbol, units } }),
  jettison: (shipSymbol: string, symbol: string, units: number) =>
    transport.request<T.jettisonResponse>("jettison", { path: { shipSymbol }, body: { symbol, units } }),
  transferCargo: (shipSymbol: string, tradeSymbol: string, units: number, receiveShipSymbol: string) =>
    transport.request<T.transferCargoResponse>("transferCargo", {
      path: { shipSymbol },
      body: { tradeSymbol, units, receiveShipSymbol },
    }),
  shipRefine: (shipSymbol: string, produceSymbol: string) =>
    transport.request<T.shipRefineResponse>("shipRefine", { path: { shipSymbol }, body: { produceSymbol } }),

  // Fleet — shipyard ops
  purchaseShip: (shipType: string, waypointSymbol: string) =>
    transport.request<T.purchaseShipResponse>("purchaseShip", { body: { shipType, waypointSymbol } }),
  installModule: (shipSymbol: string, moduleSymbol: string) =>
    transport.request<T.installShipModuleResponse>("installShipModule", {
      path: { shipSymbol },
      body: { moduleSymbol },
    }),
  removeModule: (shipSymbol: string, moduleSymbol: string) =>
    transport.request<T.removeShipModuleResponse>("removeShipModule", {
      path: { shipSymbol },
      body: { moduleSymbol },
    }),
  installMount: (shipSymbol: string, mountSymbol: string) =>
    transport.request<T.installMountResponse>("installMount", {
      path: { shipSymbol },
      body: { mountSymbol },
    }),
  removeMount: (shipSymbol: string, mountSymbol: string) =>
    transport.request<T.removeMountResponse>("removeMount", {
      path: { shipSymbol },
      body: { mountSymbol },
    }),
  repairShip: (shipSymbol: string) =>
    transport.request<T.repairShipResponse>("repairShip", { path: { shipSymbol } }),
  scrapShip: (shipSymbol: string) =>
    transport.request<T.scrapShipResponse>("scrapShip", { path: { shipSymbol } }),

  // Fleet — scans
  scanSystems: (shipSymbol: string) =>
    transport.request<T.createShipSystemScanResponse>("createShipSystemScan", { path: { shipSymbol } }),
  scanWaypoints: (shipSymbol: string) =>
    transport.request<T.createShipWaypointScanResponse>("createShipWaypointScan", { path: { shipSymbol } }),
  scanShips: (shipSymbol: string) =>
    transport.request<T.createShipShipScanResponse>("createShipShipScan", { path: { shipSymbol } }),

  // Contracts
  listContracts: (limit = 20, page = 1) =>
    transport.request<T.Contract[]>("getContracts", { query: { limit, page } }),
  acceptContract: (contractId: string) =>
    transport.request<T.acceptContractResponse>("acceptContract", { path: { contractId } }),
  deliverContract: (contractId: string, shipSymbol: string, tradeSymbol: string, units: number) =>
    transport.request<T.deliverContractResponse>("deliverContract", {
      path: { contractId },
      body: { shipSymbol, tradeSymbol, units },
    }),
  fulfillContract: (contractId: string) =>
    transport.request<T.fulfillContractResponse>("fulfillContract", { path: { contractId } }),
  negotiateContract: (shipSymbol: string) =>
    transport.request<T.negotiateContractResponse>("negotiateContract", { path: { shipSymbol } }),

  // Universe
  listSystems: (limit = 20, page = 1) =>
    transport.request<T.System[]>("getSystems", { query: { limit, page } }),
  listSystemWaypoints: (systemSymbol: string, limit = 20, page = 1, traits?: string) =>
    transport.request<T.Waypoint[]>("getSystemWaypoints", {
      path: { systemSymbol },
      query: { limit, page, traits },
    }),
  getWaypoint: (systemSymbol: string, waypointSymbol: string) =>
    transport.request<T.getWaypointResponse>("getWaypoint", { path: { systemSymbol, waypointSymbol } }),
  getMarket: (systemSymbol: string, waypointSymbol: string) =>
    transport.request<T.getMarketResponse>("getMarket", { path: { systemSymbol, waypointSymbol } }),
  getShipyard: (systemSymbol: string, waypointSymbol: string) =>
    transport.request<T.getShipyardResponse>("getShipyard", { path: { systemSymbol, waypointSymbol } }),
  getJumpGate: (systemSymbol: string, waypointSymbol: string) =>
    transport.request<T.getJumpGateResponse>("getJumpGate", { path: { systemSymbol, waypointSymbol } }),
  getConstruction: (systemSymbol: string, waypointSymbol: string) =>
    transport.request<T.getConstructionResponse>("getConstruction", { path: { systemSymbol, waypointSymbol } }),

  // Factions & data
  listFactions: (limit = 20, page = 1) =>
    transport.request<T.Faction[]>("getFactions", { query: { limit, page } }),
  supplyChain: () => transport.request("getSupplyChain"),
  socketUrl: () => transport.request<{ url?: string }>("websocketDepartureEvents"),
};

export type Api = typeof api;
