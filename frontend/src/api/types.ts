// Benutzer-Rollen
export type UserRole = 'guest' | 'loot_guest' | 'member' | 'officer' | 'treasurer' | 'admin'

// Benutzer
export interface User {
  id: number
  discord_id: string | null  // null bei importierten Usern ohne Discord
  username: string
  display_name: string | null
  avatar: string | null
  role: UserRole
  is_pioneer: boolean  // Pioneer: verantwortlich für Versorgung
  is_treasurer: boolean  // Kassenwart: verwaltet Teil der Staffelkasse
  is_kg_verwalter: boolean  // KG-Verwalter: kann Staffelstruktur bearbeiten
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
