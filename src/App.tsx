import { Routes, Route } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import DeckView from './pages/DeckView'
import StudySession from './pages/StudySession'

export default function App() {
  return (
    <div className="min-h-screen bg-slate-100">
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/deck/:deckId" element={<DeckView />} />
        <Route path="/deck/:deckId/study" element={<StudySession />} />
      </Routes>
    </div>
  )
}
