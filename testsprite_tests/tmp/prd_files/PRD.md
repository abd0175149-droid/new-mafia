# Product Requirements Document (PRD)
# Mafia Club — نادي المافيا

## 1. Product Overview

**Mafia Club** is a unified web application for managing a social Mafia card game club. It combines:
- **Admin Dashboard** — Financial management, activity scheduling, bookings, staff, and location management
- **Leader Interface** — Real-time game session control (create rooms, manage players, run Mafia games)
- **Display Screen** — TV/projector view for players showing game state
- **Player Join** — Mobile-friendly page for players to join via room code

## 2. Technology Stack

- **Frontend**: Next.js 14 (React 18), Tailwind CSS, Framer Motion, Socket.IO Client
- **Backend**: Express.js (TypeScript), Socket.IO, Drizzle ORM, PostgreSQL, Redis
- **Port**: Frontend on `localhost:3000`, Backend API on `localhost:4000`

---

## 3. User Roles & Authentication

### 3.1 Roles
| Role | Access |
|------|--------|
| `admin` | Full admin dashboard + leader interface |
| `manager` | Dashboard (limited) + leader interface |
| `leader` | Leader interface only |
| `accountant` | Finance view only |
| `location_owner` | View activities at their location |

### 3.2 Login Flows
- **Admin Login** (`/admin/login`): Username + password → JWT token → redirects to `/admin`
- **Leader Login** (`/leader`): Same credentials, separate JWT → redirects to leader interface

---

## 4. Pages & Features

### 4.1 Home Page (`/`)
- Landing page with club branding
- Two main entry buttons:
  - "غرفة العمليات" → `/leader` (Leader Interface)
  - "لوحة الإدارة" → `/admin/login` (Admin Panel)
- When leader is logged in, shows personalized welcome

### 4.2 Admin Dashboard (`/admin`)

#### 4.2.1 Activities Page (`/admin/activities`)
- **List** all activities with status filters (planned, active, completed, cancelled)
- **Create** new activity: date, location, base price, offers, description
  - Auto-generates name from location + date
  - Auto-creates Google Drive folder
  - **Auto-creates a game session (room) linked to the activity**
- **Edit** activity details
- **Delete** activity (with confirmation)
- **Activity Detail** (`/admin/activities/[id]`):
  - Financial summary (revenue, expenses, profit) with donut charts
  - Attendance distribution (paid, free, unpaid)
  - **Linked game room card** with unlink button
  - Bookings table (collapsible)
  - Costs table (collapsible)
  - Location card with map link
  - Google Drive folder browser

#### 4.2.2 Bookings (`/admin/bookings` or inline)
- Create booking: name, phone, count (number of people), payment status
- Edit booking details
- Mark as paid/free
- Delete booking
- **When bookings change, the linked session's maxPlayers auto-updates based on total people count**

#### 4.2.3 Finance Page (`/admin/finance`)
- Revenue and expense overview
- Financial reports per activity
- Payment tracking

#### 4.2.4 Game History (`/admin/game-history`)
- View all completed game sessions
- Match details with player roles and winners

#### 4.2.5 Staff Management (`/admin/staff`)
- CRUD operations for staff members
- Role assignment

#### 4.2.6 Locations (`/admin/locations`)
- Manage venue locations
- Location offers/packages with pricing
- Map URL support

#### 4.2.7 Settings (`/admin/settings`)
- System configuration

### 4.3 Leader Interface (`/leader`)

#### 4.3.1 Dashboard (No Active Game)
- **Create Room**: Game name, max players (6-27), justification count, display PIN, optional activity link
- **Active Games**: List of currently running games with rejoin capability
- **Closed Sessions**: History of completed sessions

#### 4.3.2 Session View (Room Created, LOBBY Phase)
- Room info: name, code, PIN, player count
- **Add Player**: Manual form with name, physical ID, phone, gender
- **Player Grid**: Visual cards showing all players
  - Remove player (hover action)
  - Rename player (hover action)
  - Renumber players (modal)
- **Exclude Players**: Select players to exclude from next game
- **Start Game**: Transitions to role generation (minimum 6 players)
- **Match History**: Table showing previous games in this session with winner, duration, and display replay option

#### 4.3.3 Game Flow (Active Game)
1. **ROLE_GENERATION**: System generates balanced role pool
2. **ROLE_BINDING**: Leader assigns roles to physical player IDs via dropdown table
3. **DAY_DISCUSSION**: Players discuss with timed speaker queue
4. **DAY_VOTING**: Vote to eliminate with deal support
5. **DAY_JUSTIFICATION**: Accused player defends
6. **DAY_TIEBREAKER**: Additional round if tied
7. **NIGHT**: Mafia actions (Godfather kill, Silencer, Sheriff, Doctor, Sniper, Nurse)
8. **MORNING_RECAP**: Reveal night events sequentially
9. **GAME_OVER**: Winner announced (MAFIA or CITIZEN), return to session

#### 4.3.4 Navigation
- Bottom nav: Home page link + Admin panel link

### 4.4 Display Screen (`/display`)
- Join via room code or PIN
- Shows game state for projector/TV
- Player cards, voting results, night recap
- Match replay capability

### 4.5 Player Join (`/join`)
- Mobile-friendly
- Enter room code → join as player
- Real-time updates via Socket.IO

---

## 5. Game Roles

| Role | Team | Ability |
|------|------|---------|
| GODFATHER | Mafia | Kills a player each night |
| SILENCER | Mafia | Silences a player (can't speak) |
| CHAMELEON | Mafia | Appears as citizen to Sheriff |
| MAFIA_REGULAR | Mafia | No special ability |
| SHERIFF | Citizen | Investigates one player per night |
| DOCTOR | Citizen | Protects one player from assassination |
| SNIPER | Citizen | Kills one player (risky) |
| NURSE | Citizen | One-time protection (activated by leader) |
| CITIZEN_REGULAR | Citizen | No special ability |

---

## 6. Real-time Communication

- **Socket.IO** events for all game actions
- Leader emits commands, all clients receive state updates
- Events: `room:create`, `room:join`, `room:start-generation`, `room:reset-to-lobby`, `room:new-game`, etc.

---

## 7. Data Model

### Activities
- id, name, date, description, basePrice, status, locationId, sessionId, driveLink, enabledOfferIds, isLocked

### Sessions (Game Rooms)
- id, sessionCode, displayPin, sessionName, maxPlayers, activityId, isActive

### Matches (Individual Games)
- id, sessionId, roomId, gameName, playerCount, winner (MAFIA/CITIZEN), totalRounds, durationSeconds

### Bookings
- id, activityId, name, phone, count, isPaid, paidAmount, isFree, receivedBy, notes

### Staff
- id, username, passwordHash, displayName, role, isActive

---

## 8. Key Business Rules

1. **Activity → Session link is automatic**: Creating an activity auto-creates a game session
2. **maxPlayers syncs with bookings**: Total people count (SUM of booking.count) updates session maxPlayers
3. **Multiple games per session**: A room can host multiple matches without recreating
4. **Match history persists**: All game results are saved and viewable within the session
5. **Minimum 6 players** to start a game, maximum 27
6. **Activity status auto-updates**: planned → active → completed based on date
