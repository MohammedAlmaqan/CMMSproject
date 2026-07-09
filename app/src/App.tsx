// ============================================================
// CommandPulse CMMS — Main App Component
// ============================================================

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import AppLayout from '@/components/layout/AppLayout';
import LoginPage from '@/pages/LoginPage';
import DashboardPage from '@/pages/DashboardPage';
import WorkOrdersPage from '@/pages/WorkOrdersPage';
import WorkOrderDetailPage from '@/pages/WorkOrderDetailPage';
import NotificationsPage from '@/pages/NotificationsPage';
import NotificationDetailPage from '@/pages/NotificationDetailPage';
import EquipmentPage from '@/pages/EquipmentPage';
import EquipmentDetailPage from '@/pages/EquipmentDetailPage';
import LocationsPage from '@/pages/LocationsPage';
import MaterialsPage from '@/pages/MaterialsPage';
import WorkCentersPage from '@/pages/WorkCentersPage';
import PreventiveMaintenancePage from '@/pages/PreventiveMaintenancePage';
import ReportsPage from '@/pages/ReportsPage';
import AdministrationPage from '@/pages/AdministrationPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <AppLayout>
                <Routes>
                  <Route path="/" element={<DashboardPage />} />
                  <Route path="/dashboard" element={<DashboardPage />} />
                  <Route path="/work-orders" element={<WorkOrdersPage />} />
                  <Route path="/work-orders/:id" element={<WorkOrderDetailPage />} />
                  <Route path="/notifications" element={<NotificationsPage />} />
                  <Route path="/notifications/:id" element={<NotificationDetailPage />} />
                  <Route path="/equipment" element={<EquipmentPage />} />
                  <Route path="/equipment/:id" element={<EquipmentDetailPage />} />
                  <Route path="/locations" element={<LocationsPage />} />
                  <Route path="/materials" element={<MaterialsPage />} />
                  <Route path="/work-centers" element={<WorkCentersPage />} />
                  <Route path="/preventive-maintenance" element={<PreventiveMaintenancePage />} />
                  <Route path="/reports" element={<ReportsPage />} />
                  <Route path="/administration" element={<AdministrationPage />} />
                </Routes>
              </AppLayout>
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
