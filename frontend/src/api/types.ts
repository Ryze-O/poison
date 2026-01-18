// Benutzer-Rollen
export type UserRole = 'member' | 'officer' | 'treasurer' | 'admin'

// Benutzer
export interface User {
  id: number
  discord_id: string
  username: string
  display_name: string | null
  avatar: string | null
  role: UserRole
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
  sc_type: string | null
  created_at: string
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
  created_by: User
  created_at: string
}

// Anwesenheit
export interface AttendanceRecord {
  id: number
  user: User | null
  detected_name: string | null
  created_at: string
}

export interface AttendanceSession {
  id: number
  date: string
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
  attendance_session_id: number
  created_by: User
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
