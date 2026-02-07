// Benutzer-Rollen (Kassenwart ist kein Rang sondern ein Flag: is_treasurer)
export type UserRole = 'guest' | 'loot_guest' | 'member' | 'officer' | 'admin'

// Benutzer
export interface User {
  id: number
  discord_id: string | null  // null bei importierten Usern ohne Discord
  username: string
  display_name: string | null
  avatar: string | null
  avatar_custom: string | null  // Eigener Avatar für Nicht-Discord-User
  role: UserRole
  is_pioneer: boolean  // Pioneer: verantwortlich für Versorgung
  is_treasurer: boolean  // Kassenwart: verwaltet Teil der Staffelkasse
  is_kg_verwalter: boolean  // KG-Verwalter: kann Staffelstruktur bearbeiten
  is_pending: boolean  // Wartet auf Admin-Freischaltung
  created_at: string
}

// Komponenten
export interface Component {
  id: number
  name: string
  category: string | null
  sub_category: string | null
  is_predefined: boolean
  sc_uuid: string | null
  manufacturer: string | null
  size: number | null
  grade: string | null
  item_class: string | null  // Military, Industrial, Civilian, Stealth, Competition
  sc_type: string | null
  is_stackable: boolean  // Teilbar (Erze) vs. Einzelstück (Komponenten)
  created_at: string

  // Erweiterte technische Daten
  class_name: string | null  // Interner Ref-Code z.B. "COOL_AEGS_S04_Reclaimer"
  power_base: number | null
  power_draw: number | null
  durability: number | null
  volume: number | null

  // Typ-spezifische Stats
  cooling_rate: number | null  // Cooler
  shield_hp: number | null  // Shield
  shield_regen: number | null  // Shield
  power_output: number | null  // Power Plant
  quantum_speed: number | null  // QD
  quantum_range: number | null  // QD
  quantum_fuel_rate: number | null  // QD

  // Shop-Verfügbarkeit
  shop_locations: string | null
}

// Detaillierte Komponenten-Daten (von SC Wiki API)
export interface ShieldStats {
  max_shield_health: number | null
  max_shield_regen: number | null
  decay_ratio: number | null
  downed_delay: number | null
  damage_delay: number | null
}

export interface PowerStats {
  power_base: number | null
  power_draw: number | null
  em_min: number | null
  em_max: number | null
}

export interface CoolerStats {
  cooling_rate: number | null
  suppression_ir_factor: number | null
  suppression_heat_factor: number | null
}

export interface QuantumDriveStats {
  quantum_speed: number | null
  quantum_spool_time: number | null
  quantum_cooldown_time: number | null
  quantum_range: number | null
  quantum_fuel_requirement: number | null
}

export interface ComponentDetail {
  id: number
  name: string
  category: string | null
  sub_category: string | null
  manufacturer: string | null
  size: number | null
  grade: string | null
  item_class: string | null
  description: string | null
  shield: ShieldStats | null
  power: PowerStats | null
  cooler: CoolerStats | null
  quantum_drive: QuantumDriveStats | null
  raw_stats: Record<string, unknown> | null
}

// Standorte
export interface Location {
  id: number
  name: string
  description: string | null
  system_name: string | null
  planet_name: string | null
  location_type: string | null
  is_predefined: boolean
  created_by: User | null
  created_at: string
}

// Inventar
export interface InventoryItem {
  id: number
  user_id: number
  component: Component
  location: Location | null
  quantity: number
}

export interface Transfer {
  id: number
  from_user: User
  to_user: User
  component: Component
  quantity: number
  notes: string | null
  created_at: string
}

// Kasse
export type TransactionType = 'income' | 'expense'

export interface Treasury {
  id: number
  current_balance: number
}

export interface Transaction {
  id: number
  amount: number
  transaction_type: TransactionType
  description: string
  category: string | null
  // Kassenwart-Konten
  officer_account_id: number | null  // Bei Ausgaben: von welchem Konto
  received_by_account_id: number | null  // Bei Einnahmen: auf welches Konto
  // Erweiterte Felder aus dem Bank-Spreadsheet
  sc_version: string | null
  item_reference: string | null
  beneficiary: string | null
  verified_by: string | null
  transaction_date: string | null
  created_by: User
  created_at: string
}

export interface CSVImportResponse {
  imported: number
  skipped: number
  errors: string[]
}

// Anwesenheit
export type SessionType = 'staffelabend' | 'loot_run' | 'freeplay'

export interface AttendanceRecord {
  id: number
  user: User | null
  detected_name: string | null
  created_at: string
}

export interface AttendanceSession {
  id: number
  date: string
  session_type: SessionType
  notes: string | null
  created_by: User
  records: AttendanceRecord[]
  is_confirmed: boolean
  has_screenshot: boolean
  has_loot_session: boolean
  loot_session_id: number | null
  created_at: string
}

// User-Anträge (für neue User via OCR)
export interface UserRequest {
  id: number
  username: string
  display_name: string | null
  detected_name: string
  requested_by: User
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
}

// Loot
export interface LootDistribution {
  id: number
  user: User
  quantity: number
}

export interface LootItem {
  id: number
  component: Component
  quantity: number
  distributions: LootDistribution[]
}

export interface LootSession {
  id: number
  attendance_session_id: number | null
  created_by: User
  location: Location | null
  date: string | null
  notes: string | null
  is_completed: boolean
  items: LootItem[]
  created_at: string
}

// OCR Scan Ergebnis
export interface ScanResult {
  matched: {
    user_id: number
    username: string
    display_name: string | null
    detected_name: string
  }[]
  unmatched: string[]
  total_detected: number
  screenshot_base64?: string
}

// OCR-Daten einer Session
export interface OCRData {
  matched: {
    user_id: number
    username: string
    display_name: string | null
    detected_name: string
  }[]
  unmatched: string[]
  all_users: {
    id: number
    username: string
    display_name: string | null
  }[]
}

// Gäste-Token für Login ohne Discord
export interface GuestToken {
  id: number
  token: string
  name: string
  role: UserRole
  expires_at: string | null
  is_active: boolean
  last_used_at: string | null
  created_at: string
  created_by_username: string | null
}

// Offizier-Konten (individuelle Kontostände)
export interface OfficerAccount {
  id: number
  user: User
  balance: number
  created_at: string
  updated_at: string | null
}

export interface OfficerTransaction {
  id: number
  officer_account_id: number
  amount: number
  description: string
  treasury_transaction_id: number | null
  created_by: User
  created_at: string
}

export interface OfficerAccountWithTransactions extends OfficerAccount {
  transactions: OfficerTransaction[]
}

export interface OfficerAccountsSummary {
  total_balance: number
  accounts: OfficerAccount[]
}

// Merge-Vorschläge (Discord-User mit existierendem User zusammenführen)
export interface PendingMerge {
  id: number
  discord_user: User
  existing_user: User
  match_reason: 'username_match' | 'display_name_match' | 'alias_match'
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
}

// UEX Preise und Shops
export interface ItemPrice {
  id: number
  component_id: number | null
  item_name: string
  terminal_name: string
  price_buy: number | null
  price_sell: number | null
  synced_at: string
}

export interface UEXSyncStats {
  id: number
  started_at: string
  finished_at: string | null
  items_processed: number
  items_matched: number
  items_unmatched: number
  status: string
  errors: string | null
}

// Transfer Requests (Anfragen für Items aus anderen Lagern)
export type TransferRequestStatus = 'pending' | 'approved' | 'awaiting_receipt' | 'completed' | 'rejected'

export interface TransferRequest {
  id: number
  order_number: string | null     // Bestellnummer für Discord-Koordination (z.B. "VPR-2026-0042")
  requester: User       // Wer will haben
  owner: User           // Wessen Lager
  component: Component
  from_location: Location | null
  to_location: Location | null
  quantity: number
  notes: string | null
  status: TransferRequestStatus
  approved_by: User | null      // Wer hat freigegeben (Pioneer)
  delivered_by: User | null     // Wer hat als ausgeliefert markiert
  confirmed_by: User | null     // Wer hat Erhalt bestätigt
  rejection_reason: string | null  // Begründung bei Ablehnung
  pioneer_comment: string | null   // Nur für Pioneers sichtbar (interne Notizen)
  public_comment: string | null    // Für alle sichtbar (Anmerkung an Bestellenden)
  created_at: string
  updated_at: string | null
}

export interface TransferRequestCommentUpdate {
  pioneer_comment?: string | null
  public_comment?: string | null
}

export interface TransferRequestCreate {
  owner_id: number
  component_id: number
  quantity: number
  from_location_id?: number | null
  to_location_id?: number | null
  notes?: string | null
}

export interface PendingRequestsCount {
  as_owner_pending: number      // Anfragen die ich freigeben muss (PENDING)
  as_owner_approved: number     // Anfragen die ich ausliefern muss (APPROVED)
  as_owner_awaiting: number     // Anfragen die ich ausgeliefert habe, warte auf Bestätigung
  as_requester_pending: number  // Meine Anfragen die auf Freigabe warten
  as_requester_approved: number // Meine freigegebenen Anfragen (Discord-Koordination)
  awaiting_receipt: number      // Anfragen wo ich Erhalt bestätigen muss
  admin_awaiting: number        // Für Admins: Anfragen von inaktiven Usern
  total: number
  has_unread: boolean           // Gibt es ungelesene Anfragen seit letztem Besuch?
}

// Komponenten-Suche & Dashboard
export interface ComponentSearchResult {
  pioneer: User
  component: Component
  quantity: number
  location: Location | null
  inventory_id: number
}

export interface LocationStats {
  location: Location | null
  item_count: number
  total_quantity: number
}

export interface CategoryStats {
  category: string
  item_count: number
  total_quantity: number
}

export interface PioneerInventoryStats {
  pioneer: User
  total_items: number
  total_quantity: number
  by_location: LocationStats[]
  by_category: CategoryStats[]
}

export interface InventoryDashboard {
  pioneers: PioneerInventoryStats[]
  total_items: number
  total_quantity: number
  total_pioneers: number
}

// ============== Transfer Request Summary ==============

export interface TransferRequestSummaryItem {
  component: Component
  total_quantity: number
  request_count: number
  requests: TransferRequest[]
}

export interface TransferRequestSummary {
  items: TransferRequestSummaryItem[]
  total_demand: number
  total_requests: number
}

// ============== Staffelstruktur ==============

export type MemberStatus = 'ACTIVE' | 'RECRUIT' | 'INACTIVE' | 'ABSENT'

export interface CommandGroup {
  id: number
  name: string           // "CW", "SW", "P"
  full_name: string      // "Capital Warfare"
  description: string | null
  sort_order: number
  created_at: string
}

export interface CommandGroupShip {
  id: number
  command_group_id: number
  ship_name: string
  ship_image: string | null
  sort_order: number
}

export interface OperationalRole {
  id: number
  command_group_id: number
  name: string
  description: string | null
  sort_order: number
}

export interface OperationalRoleWithUsers extends OperationalRole {
  users: UserOperationalRole[]
}

export interface FunctionRole {
  id: number
  name: string
  description: string | null
  is_leadership: boolean
  sort_order: number
}

export interface UserCommandGroup {
  id: number
  user: User
  command_group_id: number
  status: MemberStatus
  joined_at: string
  notes: string | null
}

export interface UserOperationalRole {
  id: number
  user: User
  operational_role_id: number
  is_training: boolean
  assigned_at: string
}

export interface UserFunctionRole {
  id: number
  user: User
  function_role_id: number
  assigned_at: string
}

export interface CommandGroupDetail extends CommandGroup {
  ships: CommandGroupShip[]
  operational_roles: OperationalRoleWithUsers[]
  members: UserCommandGroup[]
}

export interface FunctionRoleWithUsers extends FunctionRole {
  users: UserFunctionRole[]
}

export interface StaffelOverview {
  command_groups: CommandGroupDetail[]
  function_roles: FunctionRoleWithUsers[]
  leadership_roles: FunctionRoleWithUsers[]
  can_manage: boolean  // True wenn User Admin oder KG-Verwalter ist
}

export interface UserStaffelProfile {
  user: User
  command_groups: UserCommandGroup[]
  operational_roles: UserOperationalRole[]
  function_roles: UserFunctionRole[]
}

// ============== Self-Service & Matrix ==============

export interface MyCommandGroupsResponse {
  command_group_ids: number[]
  can_self_assign: boolean
}

export interface AssignmentCell {
  user_id: number
  operational_role_id: number
  is_assigned: boolean
  is_training: boolean
  assignment_id: number | null
}

export interface AssignmentMatrixUser {
  id: number
  membership_id: number
  username: string
  display_name: string | null
  avatar: string | null
  status: MemberStatus | null
  has_role: boolean
}

export interface AssignmentMatrixRole {
  id: number
  name: string
  description: string | null
}

export interface AssignmentMatrixResponse {
  command_group_id: number
  command_group_name: string
  users: AssignmentMatrixUser[]
  roles: AssignmentMatrixRole[]
  assignments: AssignmentCell[]
}

export interface AssignmentEntry {
  user_id: number
  operational_role_id: number
  is_assigned: boolean
  is_training: boolean
}

export interface BulkAssignmentUpdate {
  assignments: AssignmentEntry[]
}

// ============== Einsatzplaner ==============

export type MissionStatus = 'draft' | 'published' | 'locked' | 'active' | 'completed' | 'cancelled'

export interface UserShip {
  id: number
  user_id: number
  ship_name: string
  is_fitted: boolean
  loadout_notes: string | null
  created_at: string
}

export interface MissionTemplate {
  id: number
  name: string
  description: string | null
  template_data: Record<string, unknown>
  is_system: boolean
  created_by_id: number | null
  created_at: string
}

export interface MissionAssignment {
  id: number
  position_id: number
  user_id: number | null
  placeholder_name: string | null
  user: User | null
  is_backup: boolean
  is_training: boolean
  notes: string | null
  assigned_at: string
  assigned_by_id: number
}

export interface MissionPosition {
  id: number
  unit_id: number
  name: string
  position_type: string | null
  is_required: boolean
  min_count: number
  max_count: number
  required_role_id: number | null
  required_role_name: string | null  // Aufgelöster Rollenname
  notes: string | null
  sort_order: number
  assignments: MissionAssignment[]
}

export interface MissionUnit {
  id: number
  mission_id: number
  name: string
  unit_type: string | null
  description: string | null
  ship_name: string | null
  ship_id: number | null
  radio_frequencies: Record<string, string> | null
  sort_order: number
  crew_count: number
  positions: MissionPosition[]
}

export interface MissionPhase {
  id: number
  mission_id: number
  phase_number: number
  title: string
  description: string | null
  start_time: string | null
  sort_order: number
}

export interface MissionRegistration {
  id: number
  mission_id: number
  user_id: number
  user: User | null
  preferred_unit_id: number | null
  preferred_position_id: number | null
  availability_note: string | null
  ship_info: string | null
  user_loadout_ids: number[] | null
  user_loadouts_resolved: UserLoadoutResolved[] | null
  status: string
  registered_at: string
  has_ships: boolean
}

export interface Mission {
  id: number
  title: string
  description: string | null  // Legacy-Feld
  // Strukturierte Beschreibungsfelder
  mission_context: string | null
  mission_objective: string | null
  preparation_notes: string | null
  special_notes: string | null
  scheduled_date: string
  duration_minutes: number | null
  status: MissionStatus
  start_location_id: number | null
  start_location_name: string | null
  equipment_level: string | null
  target_group: string | null
  rules_of_engagement: string | null
  created_by_id: number
  created_by: User | null
  created_at: string
  updated_at: string | null
  registration_count: number
  assignment_count: number
  total_positions: number
}

export interface MissionDetail extends Mission {
  units: MissionUnit[]
  phases: MissionPhase[]
  registrations: MissionRegistration[]
}

export interface MissionCreate {
  title: string
  description?: string | null  // Legacy-Feld
  // Strukturierte Beschreibungsfelder
  mission_context?: string | null
  mission_objective?: string | null
  preparation_notes?: string | null
  special_notes?: string | null
  scheduled_date: string
  duration_minutes?: number | null
  start_location_id?: number | null
  equipment_level?: string | null
  target_group?: string | null
  rules_of_engagement?: string | null
  template_id?: number | null
}

export interface MissionUpdate {
  title?: string
  description?: string | null  // Legacy-Feld
  // Strukturierte Beschreibungsfelder
  mission_context?: string | null
  mission_objective?: string | null
  preparation_notes?: string | null
  special_notes?: string | null
  scheduled_date?: string
  duration_minutes?: number | null
  start_location_id?: number | null
  equipment_level?: string | null
  target_group?: string | null
  rules_of_engagement?: string | null
  status?: MissionStatus
}

export interface MissionUnitCreate {
  name: string
  unit_type?: string | null
  description?: string | null
  ship_name?: string | null
  ship_id?: number | null
  radio_frequencies?: Record<string, string> | null
  sort_order?: number
  crew_count?: number
  positions?: MissionPositionCreate[]
}

export interface MissionPositionCreate {
  name: string
  position_type?: string | null
  is_required?: boolean
  min_count?: number
  max_count?: number
  required_role_id?: number | null
  notes?: string | null
  sort_order?: number
}

export interface MissionPhaseCreate {
  phase_number: number
  title: string
  description?: string | null
  start_time?: string | null
  sort_order?: number
}

export interface MissionAssignmentCreate {
  position_id: number
  user_id?: number | null
  placeholder_name?: string | null
  is_backup?: boolean
  is_training?: boolean
  notes?: string | null
}

export interface MissionRegistrationCreate {
  preferred_unit_id?: number | null
  preferred_position_id?: number | null
  availability_note?: string | null
  ship_info?: string | null
  user_loadout_ids?: number[] | null
}

export interface RadioFrequencyPreset {
  key: string
  label: string
  frequency: string
}

export interface BriefingUnit {
  name: string
  ship_name: string | null
  radio_frequencies: Record<string, string> | null
  positions: Array<{
    name: string
    assigned: string[]
    is_required: boolean
    min_count: number
    max_count: number
  }>
}

export interface Briefing {
  title: string
  scheduled_date: string
  duration_minutes: number | null
  // Strukturierte Beschreibung
  mission_context: string | null
  mission_objective: string | null
  preparation_notes: string | null
  special_notes: string | null
  // Pre-Briefing
  start_location: string | null
  equipment_level: string | null
  target_group: string | null
  rules_of_engagement: string | null
  phases: MissionPhase[]
  units: BriefingUnit[]
  frequency_table: Array<Record<string, string>>
  placeholders_used: string[]
}

// ============== Assignment UI ==============

export interface OperationalRoleSimple {
  id: number
  name: string
  description: string | null
}

export interface GroupedOperationalRole {
  command_group_id: number
  command_group_name: string  // "CW", "SW", "P"
  command_group_full: string  // "Capital Warfare"
  roles: OperationalRoleSimple[]
}

export interface EligibleUser {
  id: number
  username: string
  display_name: string | null
  discord_id: string | null
  avatar: string | null
  role: string
  is_officer: boolean
  is_kg_verwalter: boolean
  is_pioneer: boolean
}

export interface PositionWithAssignments {
  id: number
  name: string
  position_type: string | null
  required_role_id: number | null
  sort_order: number
  assignments: MissionAssignment[]
}

export interface UnitWithPositions {
  id: number
  name: string
  unit_type: string | null
  ship_name: string | null
  crew_count: number
  sort_order: number
  positions: PositionWithAssignments[]
}

export interface AssignmentData {
  mission_id: number
  mission_title: string
  units: UnitWithPositions[]
  operational_roles: GroupedOperationalRole[]
  eligible_users: EligibleUser[]
  can_manage: boolean
}

// ============== Meta-Loadouts ==============

export interface ShipHardpoint {
  id: number
  hardpoint_type: string  // cooler, shield, power_plant, quantum_drive, weapon_gun, turret, missile_launcher
  size: number
  slot_index: number
  default_component_name: string | null
}

export interface Ship {
  id: number
  name: string
  slug: string | null
  manufacturer: string | null
  image_url: string | null
  size_class: string | null
  focus: string | null
}

export interface ShipWithHardpoints extends Ship {
  hardpoints: ShipHardpoint[]
}

export interface ShipSearchResult {
  id: number | null
  name: string
  slug: string | null
  manufacturer: string
  source: 'local' | 'fleetyards'
}

export interface MetaLoadoutItem {
  id: number
  hardpoint_type: string
  slot_index: number
  hardpoint_id: number | null
  component: Component
}

export interface MetaLoadout {
  id: number
  ship: Ship
  name: string
  description: string | null
  erkul_link: string | null
  is_active: boolean
  version_date: string | null
  created_by: User | null
  items: MetaLoadoutItem[]
  created_at: string
  updated_at: string | null
}

export interface MetaLoadoutList {
  id: number
  ship: Ship
  name: string
  description: string | null
  erkul_link: string | null
  is_active: boolean
  version_date: string | null
  created_by: User | null
  created_at: string
}

export interface LoadoutCheckItem {
  hardpoint_type: string
  slot_index: number
  component: Component
  required: number
  in_inventory: number
  available_from_pioneers: number
}

export interface LoadoutCheck {
  loadout: MetaLoadout
  items: LoadoutCheckItem[]
  total_required: number
  total_owned: number
  total_missing: number
}

// ============== UserLoadout (Gefittete Schiffe) ==============

export interface UserLoadout {
  id: number
  user_id: number
  loadout_id: number
  ship_id: number
  ship_nickname: string | null
  is_ready: boolean
  notes: string | null
  created_at: string
  updated_at: string | null
  loadout: MetaLoadout
  ship: Ship
}

export interface UserLoadoutWithUser extends UserLoadout {
  user: User
}

export interface UserLoadoutResolved {
  id: number
  ship_name: string | null
  ship_nickname: string | null
  loadout_name: string | null
  is_ready: boolean
}

// ============== Erkul Import ==============

export interface ErkulImportedItem {
  hardpoint_type: string
  slot_index: number
  component_id: number | null
  component_name: string | null
  erkul_local_name: string
  matched: boolean
}

export interface ErkulImportResponse {
  erkul_name: string
  erkul_ship: string
  imported_count: number
  unmatched_count: number
  unmatched_items: string[]
  items: ErkulImportedItem[]
}
