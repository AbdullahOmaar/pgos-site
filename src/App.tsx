import { BrowserRouter, Route, Routes } from 'react-router-dom'
import AppShell from './components/AppShell'
import VaultGate from './components/VaultGate'
import OfficeHome from './pages/OfficeHome'
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
import Dashboard from './pages/Dashboard'
import ProjectsMac from './pages/ProjectsMac'
import TasksV2 from './pages/TasksV2'
import DecisionsV2 from './pages/DecisionsV2'
import PreprodV2 from './pages/PreprodV2'
import OrgV2 from './pages/OrgV2'
import NotificationsV2 from './pages/NotificationsV2'
import Kickoff from './pages/Kickoff'
import TeamV2 from './pages/TeamV2'
import EnvironmentsV2 from './pages/EnvironmentsV2'
import LifecycleV2 from './pages/LifecycleV2'

export default function App() {
  return (
    <BrowserRouter>
      <VaultGate>
        <AppShell>
        <Routes>
          <Route path="/" element={<OfficeHome />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/os/projects" element={<ProjectsMac />} />
          <Route path="/os/tasks" element={<TasksV2 />} />
          <Route path="/os/decisions" element={<DecisionsV2 />} />
          <Route path="/os/preprod" element={<PreprodV2 />} />
          <Route path="/os/org" element={<OrgV2 />} />
          <Route path="/os/notifications" element={<NotificationsV2 />} />
        <Route path="/os/kickoff" element={<Kickoff />} />
        <Route path="/os/team" element={<TeamV2 />} />
        <Route path="/os/environments" element={<EnvironmentsV2 />} />
        <Route path="/os/lifecycle" element={<LifecycleV2 />} />
          <Route path="/overview" element={<Overview />} />
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
