// GENERATED from openapi.json — do not edit. Run `npm run codegen`.

/** Faction details. */
export type Faction = { "symbol": FactionSymbol; name: string; description: string; headquarters?: string; traits: FactionTrait[]; isRecruiting: boolean };

/** The symbol of the faction. */
export type FactionSymbol = "COSMIC" | "VOID" | "GALACTIC" | "QUANTUM" | "DOMINION" | "ASTRO" | "CORSAIRS" | "OBSIDIAN" | "AEGIS" | "UNITED" | "SOLITARY" | "COBALT" | "OMEGA" | "ECHO" | "LORDS" | "CULT" | "ANCIENTS" | "SHADOW" | "ETHEREAL";
export const FactionSymbolValues = ["COSMIC", "VOID", "GALACTIC", "QUANTUM", "DOMINION", "ASTRO", "CORSAIRS", "OBSIDIAN", "AEGIS", "UNITED", "SOLITARY", "COBALT", "OMEGA", "ECHO", "LORDS", "CULT", "ANCIENTS", "SHADOW", "ETHEREAL"] as const satisfies readonly FactionSymbol[];

export type FactionTrait = { "symbol": FactionTraitSymbol; name: string; description: string };

/** The unique identifier of the trait. */
export type FactionTraitSymbol = "BUREAUCRATIC" | "SECRETIVE" | "CAPITALISTIC" | "INDUSTRIOUS" | "PEACEFUL" | "DISTRUSTFUL" | "WELCOMING" | "SMUGGLERS" | "SCAVENGERS" | "REBELLIOUS" | "EXILES" | "PIRATES" | "RAIDERS" | "CLAN" | "GUILD" | "DOMINION" | "FRINGE" | "FORSAKEN" | "ISOLATED" | "LOCALIZED" | "ESTABLISHED" | "NOTABLE" | "DOMINANT" | "INESCAPABLE" | "INNOVATIVE" | "BOLD" | "VISIONARY" | "CURIOUS" | "DARING" | "EXPLORATORY" | "RESOURCEFUL" | "FLEXIBLE" | "COOPERATIVE" | "UNITED" | "STRATEGIC" | "INTELLIGENT" | "RESEARCH_FOCUSED" | "COLLABORATIVE" | "PROGRESSIVE" | "MILITARISTIC" | "TECHNOLOGICALLY_ADVANCED" | "AGGRESSIVE" | "IMPERIALISTIC" | "TREASURE_HUNTERS" | "DEXTEROUS" | "UNPREDICTABLE" | "BRUTAL" | "FLEETING" | "ADAPTABLE" | "SELF_SUFFICIENT" | "DEFENSIVE" | "PROUD" | "DIVERSE" | "INDEPENDENT" | "SELF_INTERESTED" | "FRAGMENTED" | "COMMERCIAL" | "FREE_MARKETS" | "ENTREPRENEURIAL";
export const FactionTraitSymbolValues = ["BUREAUCRATIC", "SECRETIVE", "CAPITALISTIC", "INDUSTRIOUS", "PEACEFUL", "DISTRUSTFUL", "WELCOMING", "SMUGGLERS", "SCAVENGERS", "REBELLIOUS", "EXILES", "PIRATES", "RAIDERS", "CLAN", "GUILD", "DOMINION", "FRINGE", "FORSAKEN", "ISOLATED", "LOCALIZED", "ESTABLISHED", "NOTABLE", "DOMINANT", "INESCAPABLE", "INNOVATIVE", "BOLD", "VISIONARY", "CURIOUS", "DARING", "EXPLORATORY", "RESOURCEFUL", "FLEXIBLE", "COOPERATIVE", "UNITED", "STRATEGIC", "INTELLIGENT", "RESEARCH_FOCUSED", "COLLABORATIVE", "PROGRESSIVE", "MILITARISTIC", "TECHNOLOGICALLY_ADVANCED", "AGGRESSIVE", "IMPERIALISTIC", "TREASURE_HUNTERS", "DEXTEROUS", "UNPREDICTABLE", "BRUTAL", "FLEETING", "ADAPTABLE", "SELF_SUFFICIENT", "DEFENSIVE", "PROUD", "DIVERSE", "INDEPENDENT", "SELF_INTERESTED", "FRAGMENTED", "COMMERCIAL", "FREE_MARKETS", "ENTREPRENEURIAL"] as const satisfies readonly FactionTraitSymbol[];

/** Meta details for pagination. */
export type Meta = { total: number; page: number; limit: number };

/** Public agent details. */
export type PublicAgent = { "symbol": string; headquarters: string; credits: number; startingFaction: string; shipCount: number };

/** System details. */
export type System = { constellation?: string; "symbol": string; sectorSymbol: string; type: SystemType; x: number; y: number; waypoints: SystemWaypoint[]; factions: SystemFaction[]; name?: string };

/** The type of system. */
export type SystemType = "NEUTRON_STAR" | "RED_STAR" | "ORANGE_STAR" | "BLUE_STAR" | "YOUNG_STAR" | "WHITE_DWARF" | "BLACK_HOLE" | "HYPERGIANT" | "NEBULA" | "UNSTABLE";
export const SystemTypeValues = ["NEUTRON_STAR", "RED_STAR", "ORANGE_STAR", "BLUE_STAR", "YOUNG_STAR", "WHITE_DWARF", "BLACK_HOLE", "HYPERGIANT", "NEBULA", "UNSTABLE"] as const satisfies readonly SystemType[];

/** Waypoint details. */
export type SystemWaypoint = { "symbol": WaypointSymbol; type: WaypointType; x: number; y: number; orbitals: WaypointOrbital[]; orbits?: string };

/** The symbol of the waypoint. */
export type WaypointSymbol = string;

/** The type of waypoint. */
export type WaypointType = "PLANET" | "GAS_GIANT" | "MOON" | "ORBITAL_STATION" | "JUMP_GATE" | "ASTEROID_FIELD" | "ASTEROID" | "ENGINEERED_ASTEROID" | "ASTEROID_BASE" | "NEBULA" | "DEBRIS_FIELD" | "GRAVITY_WELL" | "ARTIFICIAL_GRAVITY_WELL" | "FUEL_STATION";
export const WaypointTypeValues = ["PLANET", "GAS_GIANT", "MOON", "ORBITAL_STATION", "JUMP_GATE", "ASTEROID_FIELD", "ASTEROID", "ENGINEERED_ASTEROID", "ASTEROID_BASE", "NEBULA", "DEBRIS_FIELD", "GRAVITY_WELL", "ARTIFICIAL_GRAVITY_WELL", "FUEL_STATION"] as const satisfies readonly WaypointType[];

/** An orbital is another waypoint that orbits a parent waypoint. */
export type WaypointOrbital = { "symbol": string };

export type SystemFaction = { "symbol": FactionSymbol };

/** A waypoint is a location that ships can travel to such as a Planet, Moon or Space Station. */
export type Waypoint = { "symbol": WaypointSymbol; type: WaypointType; systemSymbol: SystemSymbol; x: number; y: number; orbitals: WaypointOrbital[]; orbits?: string; faction?: WaypointFaction; traits: WaypointTrait[]; modifiers?: WaypointModifier[]; chart?: Chart; isUnderConstruction: boolean };

/** The symbol of the system. */
export type SystemSymbol = string;

/** The faction that controls the waypoint. */
export type WaypointFaction = { "symbol": FactionSymbol };

export type WaypointTrait = { "symbol": WaypointTraitSymbol; name: string; description: string };

/** The unique identifier of the trait. */
export type WaypointTraitSymbol = "UNCHARTED" | "UNDER_CONSTRUCTION" | "MARKETPLACE" | "SHIPYARD" | "OUTPOST" | "SCATTERED_SETTLEMENTS" | "SPRAWLING_CITIES" | "MEGA_STRUCTURES" | "PIRATE_BASE" | "OVERCROWDED" | "HIGH_TECH" | "CORRUPT" | "BUREAUCRATIC" | "TRADING_HUB" | "INDUSTRIAL" | "BLACK_MARKET" | "RESEARCH_FACILITY" | "MILITARY_BASE" | "SURVEILLANCE_OUTPOST" | "EXPLORATION_OUTPOST" | "MINERAL_DEPOSITS" | "COMMON_METAL_DEPOSITS" | "PRECIOUS_METAL_DEPOSITS" | "RARE_METAL_DEPOSITS" | "METHANE_POOLS" | "ICE_CRYSTALS" | "EXPLOSIVE_GASES" | "STRONG_MAGNETOSPHERE" | "VIBRANT_AURORAS" | "SALT_FLATS" | "CANYONS" | "PERPETUAL_DAYLIGHT" | "PERPETUAL_OVERCAST" | "DRY_SEABEDS" | "MAGMA_SEAS" | "SUPERVOLCANOES" | "ASH_CLOUDS" | "VAST_RUINS" | "MUTATED_FLORA" | "TERRAFORMED" | "EXTREME_TEMPERATURES" | "EXTREME_PRESSURE" | "DIVERSE_LIFE" | "SCARCE_LIFE" | "FOSSILS" | "WEAK_GRAVITY" | "STRONG_GRAVITY" | "CRUSHING_GRAVITY" | "TOXIC_ATMOSPHERE" | "CORROSIVE_ATMOSPHERE" | "BREATHABLE_ATMOSPHERE" | "THIN_ATMOSPHERE" | "JOVIAN" | "ROCKY" | "VOLCANIC" | "FROZEN" | "SWAMP" | "BARREN" | "TEMPERATE" | "JUNGLE" | "OCEAN" | "RADIOACTIVE" | "MICRO_GRAVITY_ANOMALIES" | "DEBRIS_CLUSTER" | "DEEP_CRATERS" | "SHALLOW_CRATERS" | "UNSTABLE_COMPOSITION" | "HOLLOWED_INTERIOR" | "STRIPPED";
export const WaypointTraitSymbolValues = ["UNCHARTED", "UNDER_CONSTRUCTION", "MARKETPLACE", "SHIPYARD", "OUTPOST", "SCATTERED_SETTLEMENTS", "SPRAWLING_CITIES", "MEGA_STRUCTURES", "PIRATE_BASE", "OVERCROWDED", "HIGH_TECH", "CORRUPT", "BUREAUCRATIC", "TRADING_HUB", "INDUSTRIAL", "BLACK_MARKET", "RESEARCH_FACILITY", "MILITARY_BASE", "SURVEILLANCE_OUTPOST", "EXPLORATION_OUTPOST", "MINERAL_DEPOSITS", "COMMON_METAL_DEPOSITS", "PRECIOUS_METAL_DEPOSITS", "RARE_METAL_DEPOSITS", "METHANE_POOLS", "ICE_CRYSTALS", "EXPLOSIVE_GASES", "STRONG_MAGNETOSPHERE", "VIBRANT_AURORAS", "SALT_FLATS", "CANYONS", "PERPETUAL_DAYLIGHT", "PERPETUAL_OVERCAST", "DRY_SEABEDS", "MAGMA_SEAS", "SUPERVOLCANOES", "ASH_CLOUDS", "VAST_RUINS", "MUTATED_FLORA", "TERRAFORMED", "EXTREME_TEMPERATURES", "EXTREME_PRESSURE", "DIVERSE_LIFE", "SCARCE_LIFE", "FOSSILS", "WEAK_GRAVITY", "STRONG_GRAVITY", "CRUSHING_GRAVITY", "TOXIC_ATMOSPHERE", "CORROSIVE_ATMOSPHERE", "BREATHABLE_ATMOSPHERE", "THIN_ATMOSPHERE", "JOVIAN", "ROCKY", "VOLCANIC", "FROZEN", "SWAMP", "BARREN", "TEMPERATE", "JUNGLE", "OCEAN", "RADIOACTIVE", "MICRO_GRAVITY_ANOMALIES", "DEBRIS_CLUSTER", "DEEP_CRATERS", "SHALLOW_CRATERS", "UNSTABLE_COMPOSITION", "HOLLOWED_INTERIOR", "STRIPPED"] as const satisfies readonly WaypointTraitSymbol[];

export type WaypointModifier = { "symbol": WaypointModifierSymbol; name: string; description: string };

/** The unique identifier of the modifier. */
export type WaypointModifierSymbol = "STRIPPED" | "UNSTABLE" | "RADIATION_LEAK" | "CRITICAL_LIMIT" | "CIVIL_UNREST";
export const WaypointModifierSymbolValues = ["STRIPPED", "UNSTABLE", "RADIATION_LEAK", "CRITICAL_LIMIT", "CIVIL_UNREST"] as const satisfies readonly WaypointModifierSymbol[];

/** The chart of a system or waypoint, which makes the location visible to other agents. */
export type Chart = { waypointSymbol: WaypointSymbol; submittedBy: string; submittedOn: string };

/** The construction details of a waypoint. */
export type Construction = { "symbol": string; materials: ConstructionMaterial[]; isComplete: boolean };

/** The details of the required construction materials for a given waypoint under construction. */
export type ConstructionMaterial = { tradeSymbol: TradeSymbol; required: number; fulfilled: number };

/** The good's symbol. */
export type TradeSymbol = "PRECIOUS_STONES" | "QUARTZ_SAND" | "SILICON_CRYSTALS" | "AMMONIA_ICE" | "LIQUID_HYDROGEN" | "LIQUID_NITROGEN" | "ICE_WATER" | "EXOTIC_MATTER" | "ADVANCED_CIRCUITRY" | "GRAVITON_EMITTERS" | "IRON" | "IRON_ORE" | "COPPER" | "COPPER_ORE" | "ALUMINUM" | "ALUMINUM_ORE" | "SILVER" | "SILVER_ORE" | "GOLD" | "GOLD_ORE" | "PLATINUM" | "PLATINUM_ORE" | "DIAMONDS" | "URANITE" | "URANITE_ORE" | "MERITIUM" | "MERITIUM_ORE" | "HYDROCARBON" | "ANTIMATTER" | "FAB_MATS" | "FERTILIZERS" | "FABRICS" | "FOOD" | "JEWELRY" | "MACHINERY" | "FIREARMS" | "ASSAULT_RIFLES" | "MILITARY_EQUIPMENT" | "EXPLOSIVES" | "LAB_INSTRUMENTS" | "AMMUNITION" | "ELECTRONICS" | "SHIP_PLATING" | "SHIP_PARTS" | "EQUIPMENT" | "FUEL" | "MEDICINE" | "DRUGS" | "CLOTHING" | "MICROPROCESSORS" | "PLASTICS" | "POLYNUCLEOTIDES" | "BIOCOMPOSITES" | "QUANTUM_STABILIZERS" | "NANOBOTS" | "AI_MAINFRAMES" | "QUANTUM_DRIVES" | "ROBOTIC_DRONES" | "CYBER_IMPLANTS" | "GENE_THERAPEUTICS" | "NEURAL_CHIPS" | "MOOD_REGULATORS" | "VIRAL_AGENTS" | "MICRO_FUSION_GENERATORS" | "SUPERGRAINS" | "LASER_RIFLES" | "HOLOGRAPHICS" | "SHIP_SALVAGE" | "RELIC_TECH" | "NOVEL_LIFEFORMS" | "BOTANICAL_SPECIMENS" | "CULTURAL_ARTIFACTS" | "FRAME_PROBE" | "FRAME_DRONE" | "FRAME_INTERCEPTOR" | "FRAME_RACER" | "FRAME_FIGHTER" | "FRAME_FRIGATE" | "FRAME_SHUTTLE" | "FRAME_EXPLORER" | "FRAME_MINER" | "FRAME_LIGHT_FREIGHTER" | "FRAME_HEAVY_FREIGHTER" | "FRAME_TRANSPORT" | "FRAME_DESTROYER" | "FRAME_CRUISER" | "FRAME_CARRIER" | "FRAME_BULK_FREIGHTER" | "REACTOR_SOLAR_I" | "REACTOR_FUSION_I" | "REACTOR_FISSION_I" | "REACTOR_CHEMICAL_I" | "REACTOR_ANTIMATTER_I" | "ENGINE_IMPULSE_DRIVE_I" | "ENGINE_ION_DRIVE_I" | "ENGINE_ION_DRIVE_II" | "ENGINE_HYPER_DRIVE_I" | "MODULE_MINERAL_PROCESSOR_I" | "MODULE_GAS_PROCESSOR_I" | "MODULE_CARGO_HOLD_I" | "MODULE_CARGO_HOLD_II" | "MODULE_CARGO_HOLD_III" | "MODULE_CREW_QUARTERS_I" | "MODULE_ENVOY_QUARTERS_I" | "MODULE_PASSENGER_CABIN_I" | "MODULE_MICRO_REFINERY_I" | "MODULE_SCIENCE_LAB_I" | "MODULE_JUMP_DRIVE_I" | "MODULE_JUMP_DRIVE_II" | "MODULE_JUMP_DRIVE_III" | "MODULE_WARP_DRIVE_I" | "MODULE_WARP_DRIVE_II" | "MODULE_WARP_DRIVE_III" | "MODULE_SHIELD_GENERATOR_I" | "MODULE_SHIELD_GENERATOR_II" | "MODULE_ORE_REFINERY_I" | "MODULE_FUEL_REFINERY_I" | "MOUNT_GAS_SIPHON_I" | "MOUNT_GAS_SIPHON_II" | "MOUNT_GAS_SIPHON_III" | "MOUNT_SURVEYOR_I" | "MOUNT_SURVEYOR_II" | "MOUNT_SURVEYOR_III" | "MOUNT_SENSOR_ARRAY_I" | "MOUNT_SENSOR_ARRAY_II" | "MOUNT_SENSOR_ARRAY_III" | "MOUNT_MINING_LASER_I" | "MOUNT_MINING_LASER_II" | "MOUNT_MINING_LASER_III" | "MOUNT_LASER_CANNON_I" | "MOUNT_MISSILE_LAUNCHER_I" | "MOUNT_TURRET_I" | "SHIP_PROBE" | "SHIP_MINING_DRONE" | "SHIP_SIPHON_DRONE" | "SHIP_INTERCEPTOR" | "SHIP_LIGHT_HAULER" | "SHIP_COMMAND_FRIGATE" | "SHIP_EXPLORER" | "SHIP_HEAVY_FREIGHTER" | "SHIP_LIGHT_SHUTTLE" | "SHIP_ORE_HOUND" | "SHIP_REFINING_FREIGHTER" | "SHIP_SURVEYOR" | "SHIP_BULK_FREIGHTER";
export const TradeSymbolValues = ["PRECIOUS_STONES", "QUARTZ_SAND", "SILICON_CRYSTALS", "AMMONIA_ICE", "LIQUID_HYDROGEN", "LIQUID_NITROGEN", "ICE_WATER", "EXOTIC_MATTER", "ADVANCED_CIRCUITRY", "GRAVITON_EMITTERS", "IRON", "IRON_ORE", "COPPER", "COPPER_ORE", "ALUMINUM", "ALUMINUM_ORE", "SILVER", "SILVER_ORE", "GOLD", "GOLD_ORE", "PLATINUM", "PLATINUM_ORE", "DIAMONDS", "URANITE", "URANITE_ORE", "MERITIUM", "MERITIUM_ORE", "HYDROCARBON", "ANTIMATTER", "FAB_MATS", "FERTILIZERS", "FABRICS", "FOOD", "JEWELRY", "MACHINERY", "FIREARMS", "ASSAULT_RIFLES", "MILITARY_EQUIPMENT", "EXPLOSIVES", "LAB_INSTRUMENTS", "AMMUNITION", "ELECTRONICS", "SHIP_PLATING", "SHIP_PARTS", "EQUIPMENT", "FUEL", "MEDICINE", "DRUGS", "CLOTHING", "MICROPROCESSORS", "PLASTICS", "POLYNUCLEOTIDES", "BIOCOMPOSITES", "QUANTUM_STABILIZERS", "NANOBOTS", "AI_MAINFRAMES", "QUANTUM_DRIVES", "ROBOTIC_DRONES", "CYBER_IMPLANTS", "GENE_THERAPEUTICS", "NEURAL_CHIPS", "MOOD_REGULATORS", "VIRAL_AGENTS", "MICRO_FUSION_GENERATORS", "SUPERGRAINS", "LASER_RIFLES", "HOLOGRAPHICS", "SHIP_SALVAGE", "RELIC_TECH", "NOVEL_LIFEFORMS", "BOTANICAL_SPECIMENS", "CULTURAL_ARTIFACTS", "FRAME_PROBE", "FRAME_DRONE", "FRAME_INTERCEPTOR", "FRAME_RACER", "FRAME_FIGHTER", "FRAME_FRIGATE", "FRAME_SHUTTLE", "FRAME_EXPLORER", "FRAME_MINER", "FRAME_LIGHT_FREIGHTER", "FRAME_HEAVY_FREIGHTER", "FRAME_TRANSPORT", "FRAME_DESTROYER", "FRAME_CRUISER", "FRAME_CARRIER", "FRAME_BULK_FREIGHTER", "REACTOR_SOLAR_I", "REACTOR_FUSION_I", "REACTOR_FISSION_I", "REACTOR_CHEMICAL_I", "REACTOR_ANTIMATTER_I", "ENGINE_IMPULSE_DRIVE_I", "ENGINE_ION_DRIVE_I", "ENGINE_ION_DRIVE_II", "ENGINE_HYPER_DRIVE_I", "MODULE_MINERAL_PROCESSOR_I", "MODULE_GAS_PROCESSOR_I", "MODULE_CARGO_HOLD_I", "MODULE_CARGO_HOLD_II", "MODULE_CARGO_HOLD_III", "MODULE_CREW_QUARTERS_I", "MODULE_ENVOY_QUARTERS_I", "MODULE_PASSENGER_CABIN_I", "MODULE_MICRO_REFINERY_I", "MODULE_SCIENCE_LAB_I", "MODULE_JUMP_DRIVE_I", "MODULE_JUMP_DRIVE_II", "MODULE_JUMP_DRIVE_III", "MODULE_WARP_DRIVE_I", "MODULE_WARP_DRIVE_II", "MODULE_WARP_DRIVE_III", "MODULE_SHIELD_GENERATOR_I", "MODULE_SHIELD_GENERATOR_II", "MODULE_ORE_REFINERY_I", "MODULE_FUEL_REFINERY_I", "MOUNT_GAS_SIPHON_I", "MOUNT_GAS_SIPHON_II", "MOUNT_GAS_SIPHON_III", "MOUNT_SURVEYOR_I", "MOUNT_SURVEYOR_II", "MOUNT_SURVEYOR_III", "MOUNT_SENSOR_ARRAY_I", "MOUNT_SENSOR_ARRAY_II", "MOUNT_SENSOR_ARRAY_III", "MOUNT_MINING_LASER_I", "MOUNT_MINING_LASER_II", "MOUNT_MINING_LASER_III", "MOUNT_LASER_CANNON_I", "MOUNT_MISSILE_LAUNCHER_I", "MOUNT_TURRET_I", "SHIP_PROBE", "SHIP_MINING_DRONE", "SHIP_SIPHON_DRONE", "SHIP_INTERCEPTOR", "SHIP_LIGHT_HAULER", "SHIP_COMMAND_FRIGATE", "SHIP_EXPLORER", "SHIP_HEAVY_FREIGHTER", "SHIP_LIGHT_SHUTTLE", "SHIP_ORE_HOUND", "SHIP_REFINING_FREIGHTER", "SHIP_SURVEYOR", "SHIP_BULK_FREIGHTER"] as const satisfies readonly TradeSymbol[];

/** Ship cargo details. */
export type ShipCargo = { capacity: number; units: number; inventory: ShipCargoItem[] };

/** The type of cargo item and the number of units. */
export type ShipCargoItem = { "symbol": TradeSymbol; name: string; description: string; units: number };

/** Market details. */
export type Market = { "symbol": string; exports: TradeGood[]; imports: TradeGood[]; exchange: TradeGood[]; transactions?: MarketTransaction[]; tradeGoods?: MarketTradeGood[] };

/** A good that can be traded for other goods or currency. */
export type TradeGood = { "symbol": TradeSymbol; name: string; description: string };

/** Result of a transaction with a market. */
export type MarketTransaction = { waypointSymbol: WaypointSymbol; shipSymbol: string; tradeSymbol: string; type: "PURCHASE" | "SELL"; units: number; pricePerUnit: number; totalPrice: number; timestamp: string };

export type MarketTradeGood = { "symbol": TradeSymbol; type: "EXPORT" | "IMPORT" | "EXCHANGE"; tradeVolume: number; supply: SupplyLevel; activity?: ActivityLevel; purchasePrice: number; sellPrice: number };

/** The supply level of a trade good. */
export type SupplyLevel = "SCARCE" | "LIMITED" | "MODERATE" | "HIGH" | "ABUNDANT";
export const SupplyLevelValues = ["SCARCE", "LIMITED", "MODERATE", "HIGH", "ABUNDANT"] as const satisfies readonly SupplyLevel[];

/** The activity level of a trade good. If the good is an import, this represents how strong consumption is. If the good is an export, this represents how strong the production is for the good. When activity is strong, consumption or production is near maximum capacity. When activity is weak, consumption or production is near minimum capacity. */
export type ActivityLevel = "WEAK" | "GROWING" | "STRONG" | "RESTRICTED";
export const ActivityLevelValues = ["WEAK", "GROWING", "STRONG", "RESTRICTED"] as const satisfies readonly ActivityLevel[];

/** Details of a jump gate waypoint. */
export type JumpGate = { "symbol": WaypointSymbol; connections: string[] };

/** Shipyard details. */
export type Shipyard = { "symbol": string; shipTypes: { type: ShipType }[]; transactions?: ShipyardTransaction[]; ships?: ShipyardShip[]; modificationsFee: number };

/** Type of ship */
export type ShipType = "SHIP_PROBE" | "SHIP_MINING_DRONE" | "SHIP_SIPHON_DRONE" | "SHIP_INTERCEPTOR" | "SHIP_LIGHT_HAULER" | "SHIP_COMMAND_FRIGATE" | "SHIP_EXPLORER" | "SHIP_HEAVY_FREIGHTER" | "SHIP_LIGHT_SHUTTLE" | "SHIP_ORE_HOUND" | "SHIP_REFINING_FREIGHTER" | "SHIP_SURVEYOR" | "SHIP_BULK_FREIGHTER";
export const ShipTypeValues = ["SHIP_PROBE", "SHIP_MINING_DRONE", "SHIP_SIPHON_DRONE", "SHIP_INTERCEPTOR", "SHIP_LIGHT_HAULER", "SHIP_COMMAND_FRIGATE", "SHIP_EXPLORER", "SHIP_HEAVY_FREIGHTER", "SHIP_LIGHT_SHUTTLE", "SHIP_ORE_HOUND", "SHIP_REFINING_FREIGHTER", "SHIP_SURVEYOR", "SHIP_BULK_FREIGHTER"] as const satisfies readonly ShipType[];

/** Results of a transaction with a shipyard. */
export type ShipyardTransaction = { waypointSymbol: WaypointSymbol; shipSymbol: string; shipType: string; price: number; agentSymbol: string; timestamp: string };

/** Ship details available at a shipyard. */
export type ShipyardShip = { type: ShipType; name: string; description: string; activity?: ActivityLevel; supply: SupplyLevel; purchasePrice: number; frame: ShipFrame; reactor: ShipReactor; engine: ShipEngine; modules: ShipModule[]; mounts: ShipMount[]; crew: { required: number; capacity: number } };

/** The frame of the ship. The frame determines the number of modules and mounting points of the ship, as well as base fuel capacity. As the condition of the frame takes more wear, the ship will become more sluggish and less maneuverable. */
export type ShipFrame = { "symbol": "FRAME_PROBE" | "FRAME_DRONE" | "FRAME_INTERCEPTOR" | "FRAME_RACER" | "FRAME_FIGHTER" | "FRAME_FRIGATE" | "FRAME_SHUTTLE" | "FRAME_EXPLORER" | "FRAME_MINER" | "FRAME_LIGHT_FREIGHTER" | "FRAME_HEAVY_FREIGHTER" | "FRAME_TRANSPORT" | "FRAME_DESTROYER" | "FRAME_CRUISER" | "FRAME_CARRIER" | "FRAME_BULK_FREIGHTER"; name: string; condition: ShipComponentCondition; integrity: ShipComponentIntegrity; description: string; moduleSlots: number; mountingPoints: number; fuelCapacity: number; requirements: ShipRequirements; quality: ShipComponentQuality };

/** The repairable condition of a component. A value of 0 indicates the component needs significant repairs, while a value of 1 indicates the component is in near perfect condition. As the condition of a component is repaired, the overall integrity of the component decreases. */
export type ShipComponentCondition = number;

/** The overall integrity of the component, which determines the performance of the component. A value of 0 indicates that the component is almost completely degraded, while a value of 1 indicates that the component is in near perfect condition. The integrity of the component is non-repairable, and represents permanent wear over time. */
export type ShipComponentIntegrity = number;

/** The requirements for installation on a ship */
export type ShipRequirements = { power?: number; crew?: number; slots?: number };

/** The overall quality of the component, which determines the quality of the component. High quality components return more ships parts and ship plating when a ship is scrapped. But also require more of these parts to repair. This is transparent to the player, as the parts are bought from/sold to the marketplace. */
export type ShipComponentQuality = number;

/** The reactor of the ship. The reactor is responsible for powering the ship's systems and weapons. */
export type ShipReactor = { "symbol": "REACTOR_SOLAR_I" | "REACTOR_FUSION_I" | "REACTOR_FISSION_I" | "REACTOR_CHEMICAL_I" | "REACTOR_ANTIMATTER_I"; name: string; condition: ShipComponentCondition; integrity: ShipComponentIntegrity; description: string; powerOutput: number; requirements: ShipRequirements; quality: ShipComponentQuality };

/** The engine determines how quickly a ship travels between waypoints. */
export type ShipEngine = { "symbol": "ENGINE_IMPULSE_DRIVE_I" | "ENGINE_ION_DRIVE_I" | "ENGINE_ION_DRIVE_II" | "ENGINE_HYPER_DRIVE_I"; name: string; condition: ShipComponentCondition; integrity: ShipComponentIntegrity; description: string; speed: number; requirements: ShipRequirements; quality: ShipComponentQuality };

/** A module can be installed in a ship and provides a set of capabilities such as storage space or quarters for crew. Module installations are permanent. */
export type ShipModule = { "symbol": "MODULE_MINERAL_PROCESSOR_I" | "MODULE_GAS_PROCESSOR_I" | "MODULE_CARGO_HOLD_I" | "MODULE_CARGO_HOLD_II" | "MODULE_CARGO_HOLD_III" | "MODULE_CREW_QUARTERS_I" | "MODULE_ENVOY_QUARTERS_I" | "MODULE_PASSENGER_CABIN_I" | "MODULE_MICRO_REFINERY_I" | "MODULE_ORE_REFINERY_I" | "MODULE_FUEL_REFINERY_I" | "MODULE_SCIENCE_LAB_I" | "MODULE_JUMP_DRIVE_I" | "MODULE_JUMP_DRIVE_II" | "MODULE_JUMP_DRIVE_III" | "MODULE_WARP_DRIVE_I" | "MODULE_WARP_DRIVE_II" | "MODULE_WARP_DRIVE_III" | "MODULE_SHIELD_GENERATOR_I" | "MODULE_SHIELD_GENERATOR_II"; name: string; description: string; capacity?: number; range?: number; requirements: ShipRequirements };

/** A mount is installed on the exterier of a ship. */
export type ShipMount = { "symbol": "MOUNT_GAS_SIPHON_I" | "MOUNT_GAS_SIPHON_II" | "MOUNT_GAS_SIPHON_III" | "MOUNT_SURVEYOR_I" | "MOUNT_SURVEYOR_II" | "MOUNT_SURVEYOR_III" | "MOUNT_SENSOR_ARRAY_I" | "MOUNT_SENSOR_ARRAY_II" | "MOUNT_SENSOR_ARRAY_III" | "MOUNT_MINING_LASER_I" | "MOUNT_MINING_LASER_II" | "MOUNT_MINING_LASER_III" | "MOUNT_LASER_CANNON_I" | "MOUNT_MISSILE_LAUNCHER_I" | "MOUNT_TURRET_I"; name: string; description: string; strength?: number; deposits?: "QUARTZ_SAND" | "SILICON_CRYSTALS" | "PRECIOUS_STONES" | "ICE_WATER" | "AMMONIA_ICE" | "IRON_ORE" | "COPPER_ORE" | "SILVER_ORE" | "ALUMINUM_ORE" | "GOLD_ORE" | "PLATINUM_ORE" | "DIAMONDS" | "URANITE_ORE" | "MERITIUM_ORE"[]; requirements: ShipRequirements };

/** Contract details. */
export type Contract = { id: string; factionSymbol: string; type: "PROCUREMENT" | "TRANSPORT" | "SHUTTLE"; terms: ContractTerms; accepted: boolean; fulfilled: boolean; expiration: string; deadlineToAccept?: string };

/** The terms to fulfill the contract. */
export type ContractTerms = { deadline: string; payment: ContractPayment; deliver?: ContractDeliverGood[] };

/** Payments for the contract. */
export type ContractPayment = { onAccepted: number; onFulfilled: number };

/** The details of a delivery contract. Includes the type of good, units needed, and the destination. */
export type ContractDeliverGood = { tradeSymbol: string; destinationSymbol: string; unitsRequired: number; unitsFulfilled: number };

/** Agent details. */
export type Agent = { accountId: string; "symbol": string; headquarters: string; credits: number; startingFaction: string; shipCount: number };

/** Agent event details. */
export type AgentEvent = { id: string; type: string; message: string; data?: unknown; createdAt: string };

/** Ship details. */
export type Ship = { "symbol": string; registration: ShipRegistration; nav: ShipNav; crew: ShipCrew; frame: ShipFrame; reactor: ShipReactor; engine: ShipEngine; modules: ShipModule[]; mounts: ShipMount[]; cargo: ShipCargo; fuel: ShipFuel; cooldown: Cooldown };

/** The public registration information of the ship */
export type ShipRegistration = { name: string; factionSymbol: string; role: ShipRole };

/** The registered role of the ship */
export type ShipRole = "FABRICATOR" | "HARVESTER" | "HAULER" | "INTERCEPTOR" | "EXCAVATOR" | "TRANSPORT" | "REPAIR" | "SURVEYOR" | "COMMAND" | "CARRIER" | "PATROL" | "SATELLITE" | "EXPLORER" | "REFINERY";
export const ShipRoleValues = ["FABRICATOR", "HARVESTER", "HAULER", "INTERCEPTOR", "EXCAVATOR", "TRANSPORT", "REPAIR", "SURVEYOR", "COMMAND", "CARRIER", "PATROL", "SATELLITE", "EXPLORER", "REFINERY"] as const satisfies readonly ShipRole[];

/** The navigation information of the ship. */
export type ShipNav = { systemSymbol: SystemSymbol; waypointSymbol: WaypointSymbol; route: ShipNavRoute; status: ShipNavStatus; flightMode: ShipNavFlightMode };

/** The routing information for the ship's most recent transit or current location. */
export type ShipNavRoute = { destination: ShipNavRouteWaypoint; origin: ShipNavRouteWaypoint; departureTime: string; arrival: string };

/** The destination or departure of a ships nav route. */
export type ShipNavRouteWaypoint = { "symbol": string; type: WaypointType; systemSymbol: SystemSymbol; x: number; y: number };

/** The current status of the ship */
export type ShipNavStatus = "IN_TRANSIT" | "IN_ORBIT" | "DOCKED";
export const ShipNavStatusValues = ["IN_TRANSIT", "IN_ORBIT", "DOCKED"] as const satisfies readonly ShipNavStatus[];

/** The ship's set speed when traveling between waypoints or systems. */
export type ShipNavFlightMode = "DRIFT" | "STEALTH" | "CRUISE" | "BURN";
export const ShipNavFlightModeValues = ["DRIFT", "STEALTH", "CRUISE", "BURN"] as const satisfies readonly ShipNavFlightMode[];

/** The ship's crew service and maintain the ship's systems and equipment. */
export type ShipCrew = { current: number; required: number; capacity: number; rotation: "STRICT" | "RELAXED"; morale: number; wages: number };

/** Details of the ship's fuel tanks including how much fuel was consumed during the last transit or action. */
export type ShipFuel = { current: number; capacity: number; consumed?: { amount: number; timestamp: string } };

/** A cooldown is a period of time in which a ship cannot perform certain actions. */
export type Cooldown = { shipSymbol: string; totalSeconds: number; remainingSeconds: number; expiration?: string };

/** Result of a chart transaction. */
export type ChartTransaction = { waypointSymbol: WaypointSymbol; shipSymbol: string; totalPrice: number; timestamp: string };

/** Extraction details. */
export type Extraction = { shipSymbol: string; "yield": ExtractionYield };

/** A yield from the extraction operation. */
export type ExtractionYield = { "symbol": TradeSymbol; units: number };

/** An event that represents damage or wear to a ship's reactor, frame, or engine, reducing the condition of the ship. */
export type ShipConditionEvent = { "symbol": "REACTOR_OVERLOAD" | "ENERGY_SPIKE_FROM_MINERAL" | "SOLAR_FLARE_INTERFERENCE" | "COOLANT_LEAK" | "POWER_DISTRIBUTION_FLUCTUATION" | "MAGNETIC_FIELD_DISRUPTION" | "HULL_MICROMETEORITE_STRIKES" | "STRUCTURAL_STRESS_FRACTURES" | "CORROSIVE_MINERAL_CONTAMINATION" | "THERMAL_EXPANSION_MISMATCH" | "VIBRATION_DAMAGE_FROM_DRILLING" | "ELECTROMAGNETIC_FIELD_INTERFERENCE" | "IMPACT_WITH_EXTRACTED_DEBRIS" | "FUEL_EFFICIENCY_DEGRADATION" | "COOLANT_SYSTEM_AGEING" | "DUST_MICROABRASIONS" | "THRUSTER_NOZZLE_WEAR" | "EXHAUST_PORT_CLOGGING" | "BEARING_LUBRICATION_FADE" | "SENSOR_CALIBRATION_DRIFT" | "HULL_MICROMETEORITE_DAMAGE" | "SPACE_DEBRIS_COLLISION" | "THERMAL_STRESS" | "VIBRATION_OVERLOAD" | "PRESSURE_DIFFERENTIAL_STRESS" | "ELECTROMAGNETIC_SURGE_EFFECTS" | "ATMOSPHERIC_ENTRY_HEAT"; component: "FRAME" | "REACTOR" | "ENGINE"; name: string; description: string };

/** A resource survey of a waypoint, detailing a specific extraction location and the types of resources that can be found there. */
export type Survey = { signature: string; "symbol": string; deposits: SurveyDeposit[]; expiration: string; size: SurveySize };

/** A surveyed deposit of a mineral or resource available for extraction. */
export type SurveyDeposit = { "symbol": (TradeSymbol) };

/** The size of the deposit. This value indicates how much can be extracted from the survey before it is exhausted. */
export type SurveySize = "SMALL" | "MODERATE" | "LARGE";
export const SurveySizeValues = ["SMALL", "MODERATE", "LARGE"] as const satisfies readonly SurveySize[];

/** Details of a system was that scanned. */
export type ScannedSystem = { "symbol": string; sectorSymbol: string; type: SystemType; x: number; y: number; distance: number };

/** A waypoint that was scanned by a ship. */
export type ScannedWaypoint = { "symbol": WaypointSymbol; type: WaypointType; systemSymbol: SystemSymbol; x: number; y: number; orbitals: WaypointOrbital[]; faction?: WaypointFaction; traits: WaypointTrait[]; chart?: Chart };

/** The ship that was scanned. Details include information about the ship that could be detected by the scanner. */
export type ScannedShip = { "symbol": string; registration: ShipRegistration; nav: ShipNav; frame?: { "symbol": string }; reactor?: { "symbol": string }; engine: { "symbol": string }; mounts?: { "symbol": string }[] };

/** Result of a scrap transaction. */
export type ScrapTransaction = { waypointSymbol: WaypointSymbol; shipSymbol: string; totalPrice: number; timestamp: string };

/** Result of a repair transaction. */
export type RepairTransaction = { waypointSymbol: WaypointSymbol; shipSymbol: string; totalPrice: number; timestamp: string };

/** Siphon details. */
export type Siphon = { shipSymbol: string; "yield": SiphonYield };

/** A yield from the siphon operation. */
export type SiphonYield = { "symbol": TradeSymbol; units: number };

/** Result of a transaction for a ship modification, such as installing a mount or a module. */
export type ShipModificationTransaction = { waypointSymbol: string; shipSymbol: string; tradeSymbol: string; totalPrice: number; timestamp: string };

// ---- Operation response types (unwrapped from { data, meta }) ----

export type getFactionsResponse = Faction[];

export type getFactionResponse = Faction;

export type getAgentsResponse = PublicAgent[];

export type getAgentResponse = PublicAgent;

export type getSupplyChainResponse = { exportToImportMap: Record<string, string[]> };

export type getStatusResponse = { status: string; version: string; resetDate: string; description: string; stats: { accounts?: number; agents: number; ships: number; systems: number; waypoints: number }; health: { lastMarketUpdate?: string }; leaderboards: { mostCredits: { agentSymbol: string; credits: number }[]; mostSubmittedCharts: { agentSymbol: string; chartCount: number }[] }; serverResets: { next: string; frequency: string }; announcements: { title: string; body: string }[]; links: { name: string; url: string }[] };

export type getErrorCodesResponse = { errorCodes: { code: number; name: string }[] };

export type getSystemsResponse = System[];

export type getSystemResponse = System;

export type getSystemWaypointsResponse = Waypoint[];

export type getWaypointResponse = Waypoint;

export type getConstructionResponse = Construction;

export type supplyConstructionResponse = { construction: Construction; cargo: ShipCargo };

export type getMarketResponse = Market;

export type getJumpGateResponse = JumpGate;

export type getShipyardResponse = Shipyard;

export type getContractsResponse = Contract[];

export type getContractResponse = Contract;

export type acceptContractResponse = { contract: Contract; agent: Agent };

export type fulfillContractResponse = { contract: Contract; agent: Agent };

export type deliverContractResponse = { contract: Contract; cargo: ShipCargo };

export type getMyFactionsResponse = { "symbol": string; reputation: number }[];

export type getMyAgentResponse = Agent;

export type getMyAgentEventsResponse = AgentEvent[];

export type getMyShipsResponse = Ship[];

export type purchaseShipResponse = { ship: Ship; agent: Agent; transaction: ShipyardTransaction };

export type getMyAccountResponse = { account: { id: string; email: string| null; token?: string; createdAt: string } };

export type getMyShipResponse = Ship;

export type createChartResponse = { chart: Chart; waypoint: Waypoint; transaction: ChartTransaction; agent: Agent };

export type negotiateContractResponse = { contract: Contract };

export type getShipCooldownResponse = Cooldown;

export type dockShipResponse = { nav: ShipNav };

export type extractResourcesResponse = { extraction: Extraction; cooldown: Cooldown; cargo: ShipCargo; modifiers?: WaypointModifier[]; events: ShipConditionEvent[] };

export type extractResourcesWithSurveyResponse = { extraction: Extraction; cooldown: Cooldown; cargo: ShipCargo; modifiers?: WaypointModifier[]; events: ShipConditionEvent[] };

export type jettisonResponse = { cargo: ShipCargo };

export type jumpShipResponse = { nav: ShipNav; cooldown: Cooldown; transaction: MarketTransaction; agent: Agent };

export type createShipSystemScanResponse = { cooldown: Cooldown; systems: ScannedSystem[] };

export type createShipWaypointScanResponse = { cooldown: Cooldown; waypoints: ScannedWaypoint[] };

export type createShipShipScanResponse = { cooldown: Cooldown; ships: ScannedShip[] };

export type scrapShipResponse = { agent: Agent; transaction: ScrapTransaction };

export type getScrapShipResponse = { transaction: ScrapTransaction };

export type navigateShipResponse = { nav: ShipNav; fuel: ShipFuel; events: ShipConditionEvent[] };

export type warpShipResponse = { nav: ShipNav; fuel: ShipFuel; events: ShipConditionEvent[] };

export type orbitShipResponse = { nav: ShipNav };

export type purchaseCargoResponse = { cargo: ShipCargo; transaction: MarketTransaction; agent: Agent };

export type shipRefineResponse = { cargo: ShipCargo; cooldown: Cooldown; produced: { tradeSymbol: (TradeSymbol); units: number }[]; consumed: { tradeSymbol: (TradeSymbol); units: number }[] };

export type refuelShipResponse = { agent: Agent; fuel: ShipFuel; cargo?: ShipCargo; transaction: MarketTransaction };

export type repairShipResponse = { agent: Agent; ship: Ship; transaction: RepairTransaction };

export type getRepairShipResponse = { transaction: RepairTransaction };

export type sellCargoResponse = { cargo: ShipCargo; transaction: MarketTransaction; agent: Agent };

export type siphonResourcesResponse = { siphon: Siphon; cooldown: Cooldown; cargo: ShipCargo; events: ShipConditionEvent[] };

export type createSurveyResponse = { cooldown: Cooldown; surveys: Survey[] };

export type transferCargoResponse = { cargo: ShipCargo; targetCargo: ShipCargo };

export type getMyShipCargoResponse = ShipCargo;

export type getShipModulesResponse = ShipModule[];

export type installShipModuleResponse = { agent: Agent; modules: ShipModule[]; cargo: ShipCargo; transaction: ShipModificationTransaction };

export type removeShipModuleResponse = { agent: Agent; modules: ShipModule[]; cargo: ShipCargo; transaction: ShipModificationTransaction };

export type getMountsResponse = ShipMount[];

export type installMountResponse = { agent: Agent; mounts: ShipMount[]; cargo: ShipCargo; transaction: ShipModificationTransaction };

export type removeMountResponse = { agent: Agent; mounts: ShipMount[]; cargo: ShipCargo; transaction: ShipModificationTransaction };

export type getShipNavResponse = ShipNav;

export type patchShipNavResponse = { nav: ShipNav; fuel: ShipFuel; events: ShipConditionEvent[] };

export type registerResponse = { token: string; agent: Agent; faction: Faction; contract: Contract; ships: Ship[] };
