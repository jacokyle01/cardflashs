import { Routes, Route } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import DeckView from './pages/DeckView'
import StudySession from './pages/StudySession'
import Settings from './pages/Settings'
import { AuthProvider } from './lib/AuthContext'

export default function App() {
  return (
    <AuthProvider>
      <div className="min-h-screen bg-slate-100">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/deck/:deckId" element={<DeckView />} />
          <Route path="/deck/:deckId/study" element={<StudySession />} />
        </Routes>
      </div>
    </AuthProvider>
  )
}
