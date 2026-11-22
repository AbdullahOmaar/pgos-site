import { BrowserRouter, Route, Routes } from 'react-router-dom'
import AppShell from './components/AppShell'
import VaultGate from './components/VaultGate'
import Overview from './pages/Overview'
import Projects from './pages/Projects'
import Decisions from './pages/Decisions'
import WorkOrders from './pages/WorkOrders'
import Risks from './pages/Risks'
import Evidence from './pages/Evidence'
import Ledger from './pages/Ledger'
import Completeness from './pages/Completeness'
import Validation from './pages/Validation'
import Tasks from './pages/Tasks'
import HqDecisions from './pages/HqDecisions'
import Reports from './pages/Reports'
import Authority from './pages/Authority'
import Adoption from './pages/Adoption'
import AskCompany from './pages/AskCompany'
import Preprod from './pages/Preprod'

export default function App() {
  return (
    <BrowserRouter>
      <VaultGate>
        <AppShell>
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/decisions" element={<Decisions />} />
          <Route path="/work-orders" element={<WorkOrders />} />
          <Route path="/risks" element={<Risks />} />
          <Route path="/evidence" element={<Evidence />} />
          <Route path="/ledger" element={<Ledger />} />
          <Route path="/completeness" element={<Completeness />} />
          <Route path="/validation" element={<Validation />} />
          <Route path="/preprod" element={<Preprod />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/hq-decisions" element={<HqDecisions />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/authority" element={<Authority />} />
          <Route path="/adoption" element={<Adoption />} />
          <Route path="/ask" element={<AskCompany />} />
          <Route path="*" element={<Overview />} />
          </Routes>
        </AppShell>
      </VaultGate>
    </BrowserRouter>
  )
}
