// ============================================================
// CommandPulse CMMS — Comprehensive Mock Data
// ============================================================

import type {
  FunctionalLocation,
  Equipment,
  EquipmentMeter,
  WorkCenter,
  Craft,
  Material,
  FailureCode,
  CauseCode,
  TaskList,
  TaskListOperation,
  Notification,
  WorkOrder,
  WorkOrderOperation,
  WorkOrderMaterial,
  LaborEntry,
  ExternalServiceCost,
  SafetyChecklistTemplate,
  ChecklistItem,
  WorkOrderChecklist,
  MaintenancePlan,
  AuditLogEntry,
  User,
  SystemAlert,
  Comment,
  DashboardKPIs,
  MeterReading,
} from '@/types';

// ─── Users (§2.2) ───
export const mockUsers: User[] = [
  {
    userId: 'USR-001',
    username: 'admin',
    fullName: 'System Administrator',
    email: 'admin@commandpulse.com',
    role: 'Administrator',
    workCenterId: null,
    isActive: true,
    lastLogin: '2026-07-05T08:30:00Z',
  },
  {
    userId: 'USR-002',
    username: 'planner',
    fullName: 'Sarah Chen',
    email: 's.chen@commandpulse.com',
    role: 'Maintenance Planner',
    workCenterId: null,
    isActive: true,
    lastLogin: '2026-07-05T09:15:00Z',
  },
  {
    userId: 'USR-003',
    username: 'supervisor',
    fullName: 'Mike Rodriguez',
    email: 'm.rodriguez@commandpulse.com',
    role: 'Maintenance Supervisor',
    workCenterId: 'WC-001',
    isActive: true,
    lastLogin: '2026-07-05T07:45:00Z',
  },
  {
    userId: 'USR-004',
    username: 'tech1',
    fullName: 'James Wilson',
    email: 'j.wilson@commandpulse.com',
    role: 'Technician',
    workCenterId: 'WC-001',
    isActive: true,
    lastLogin: '2026-07-05T06:00:00Z',
  },
  {
    userId: 'USR-005',
    username: 'tech2',
    fullName: 'Aisha Patel',
    email: 'a.patel@commandpulse.com',
    role: 'Technician',
    workCenterId: 'WC-002',
    isActive: true,
    lastLogin: '2026-07-04T16:30:00Z',
  },
  {
    userId: 'USR-006',
    username: 'operator',
    fullName: 'Carlos Mendez',
    email: 'c.mendez@commandpulse.com',
    role: 'Requester',
    workCenterId: null,
    isActive: true,
    lastLogin: '2026-07-05T10:00:00Z',
  },
  {
    userId: 'USR-007',
    username: 'auditor',
    fullName: 'Lisa Thompson',
    email: 'l.thompson@commandpulse.com',
    role: 'View-Only',
    workCenterId: null,
    isActive: true,
    lastLogin: '2026-07-03T14:20:00Z',
  },
];

// ─── Functional Locations (§3.1.1) ───
export const mockLocations: FunctionalLocation[] = [
  { functionalLocationId: 'FL-001', locationCode: 'PLT-01', description: 'Main Process Plant', parentLocationId: null, locationType: 'Plant', operationalStatus: 'Active', installationDate: '2018-03-15', gpsCoordinates: '25.2048°N, 55.2708°E', safetyCritical: true, createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { functionalLocationId: 'FL-002', locationCode: 'PLT-01/PRD', description: 'Production Area', parentLocationId: 'FL-001', locationType: 'Area', operationalStatus: 'Active', installationDate: '2018-03-15', gpsCoordinates: null, safetyCritical: true, createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { functionalLocationId: 'FL-003', locationCode: 'PLT-01/PRD/U-100', description: 'Reaction Unit 100', parentLocationId: 'FL-002', locationType: 'Unit', operationalStatus: 'Active', installationDate: '2018-06-01', gpsCoordinates: null, safetyCritical: true, createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { functionalLocationId: 'FL-004', locationCode: 'PLT-01/PRD/U-100/R-101', description: 'Reactor 101 Sub-unit', parentLocationId: 'FL-003', locationType: 'Sub-unit', operationalStatus: 'Active', installationDate: '2018-06-01', gpsCoordinates: null, safetyCritical: true, createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { functionalLocationId: 'FL-005', locationCode: 'PLT-01/PRD/U-100/R-102', description: 'Reactor 102 Sub-unit', parentLocationId: 'FL-003', locationType: 'Sub-unit', operationalStatus: 'Active', installationDate: '2018-06-01', gpsCoordinates: null, safetyCritical: true, createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { functionalLocationId: 'FL-006', locationCode: 'PLT-01/PRD/U-200', description: 'Separation Unit 200', parentLocationId: 'FL-002', locationType: 'Unit', operationalStatus: 'Active', installationDate: '2018-08-01', gpsCoordinates: null, safetyCritical: true, createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { functionalLocationId: 'FL-007', locationCode: 'PLT-01/PRD/U-200/D-201', description: 'Distillation Column 201', parentLocationId: 'FL-006', locationType: 'Sub-unit', operationalStatus: 'Active', installationDate: '2018-08-01', gpsCoordinates: null, safetyCritical: true, createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { functionalLocationId: 'FL-008', locationCode: 'PLT-01/UTL', description: 'Utilities Area', parentLocationId: 'FL-001', locationType: 'Area', operationalStatus: 'Active', installationDate: '2018-03-15', gpsCoordinates: null, safetyCritical: true, createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { functionalLocationId: 'FL-009', locationCode: 'PLT-01/UTL/B-301', description: 'Boiler House 301', parentLocationId: 'FL-008', locationType: 'Unit', operationalStatus: 'Active', installationDate: '2018-04-01', gpsCoordinates: null, safetyCritical: true, createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { functionalLocationId: 'FL-010', locationCode: 'PLT-01/UTL/C-302', description: 'Cooling Tower 302', parentLocationId: 'FL-008', locationType: 'Unit', operationalStatus: 'Active', installationDate: '2018-04-01', gpsCoordinates: null, safetyCritical: false, createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { functionalLocationId: 'FL-011', locationCode: 'PLT-01/WHS', description: 'Warehouse', parentLocationId: 'FL-001', locationType: 'Area', operationalStatus: 'Active', installationDate: '2018-03-15', gpsCoordinates: null, safetyCritical: false, createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { functionalLocationId: 'FL-012', locationCode: 'PLT-01/WHS/S-401', description: 'Spare Parts Store', parentLocationId: 'FL-011', locationType: 'Unit', operationalStatus: 'Active', installationDate: '2018-03-15', gpsCoordinates: null, safetyCritical: false, createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
];

// ─── Equipment (§3.1.2) ───
export const mockEquipment: Equipment[] = [
  { equipmentId: 'EQ-001', equipmentCode: 'P-101A', name: 'Reactor Feed Pump 101A', description: 'Centrifugal pump supplying feedstock to Reactor 101', functionalLocationId: 'FL-004', manufacturer: 'Sulzer', model: 'AHLSTAR A', serialNumber: 'SN-2018-0042', assetTag: 'AT-10042', equipmentClass: 'Pump', criticality: 'A', installationDate: '2018-06-15', warrantyExpiryDate: '2023-06-15', operationalStatus: 'Active', technicalParameters: { 'Max Flow': '150 m³/h', 'Head': '120 m', 'Power': '75 kW', 'Speed': '2950 RPM', 'NPSHr': '3.5 m' }, createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { equipmentId: 'EQ-002', equipmentCode: 'P-101B', name: 'Reactor Feed Pump 101B', description: 'Standby centrifugal pump for Reactor 101 feed', functionalLocationId: 'FL-004', manufacturer: 'Sulzer', model: 'AHLSTAR A', serialNumber: 'SN-2018-0043', assetTag: 'AT-10043', equipmentClass: 'Pump', criticality: 'A', installationDate: '2018-06-15', warrantyExpiryDate: '2023-06-15', operationalStatus: 'Active', technicalParameters: { 'Max Flow': '150 m³/h', 'Head': '120 m', 'Power': '75 kW', 'Speed': '2950 RPM', 'NPSHr': '3.5 m' }, createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { equipmentId: 'EQ-003', equipmentCode: 'M-101', name: 'Reactor 101 Agitator Motor', description: 'Main drive motor for Reactor 101 agitator', functionalLocationId: 'FL-004', manufacturer: 'ABB', model: 'M3BP 315 SMC', serialNumber: 'SN-2018-0105', assetTag: 'AT-10105', equipmentClass: 'Motor', criticality: 'A', installationDate: '2018-06-01', warrantyExpiryDate: '2023-06-01', operationalStatus: 'Active', technicalParameters: { 'Power': '200 kW', 'Voltage': '690 V', 'Current': '168 A', 'Speed': '1485 RPM', 'IP Rating': 'IP55' }, createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { equipmentId: 'EQ-004', equipmentCode: 'V-101', name: 'Reactor 101 Pressure Vessel', description: 'Main pressure vessel for Reactor 101', functionalLocationId: 'FL-004', manufacturer: 'Doosan', model: 'PV-2000', serialNumber: 'SN-2018-0156', assetTag: 'AT-10156', equipmentClass: 'Vessel', criticality: 'A', installationDate: '2018-05-15', warrantyExpiryDate: '2028-05-15', operationalStatus: 'Active', technicalParameters: { 'Design Pressure': '50 bar', 'Design Temp': '350°C', 'Volume': '12.5 m³', 'Material': 'SA-516 Gr.70', 'Wall Thickness': '45 mm' }, createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { equipmentId: 'EQ-005', equipmentCode: 'P-102', name: 'Reactor 102 Discharge Pump', description: 'Pump discharging product from Reactor 102', functionalLocationId: 'FL-005', manufacturer: 'Flowserve', model: 'HPX 200-150-400', serialNumber: 'SN-2018-0078', assetTag: 'AT-10078', equipmentClass: 'Pump', criticality: 'B', installationDate: '2018-06-20', warrantyExpiryDate: '2023-06-20', operationalStatus: 'Active', technicalParameters: { 'Max Flow': '200 m³/h', 'Head': '80 m', 'Power': '55 kW', 'Speed': '2970 RPM' }, createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { equipmentId: 'EQ-006', equipmentCode: 'HX-201', name: 'Distillation Reboiler 201', description: 'Shell and tube heat exchanger for Distillation Column 201', functionalLocationId: 'FL-007', manufacturer: 'Alfa Laval', model: 'T45-MFG', serialNumber: 'SN-2018-0234', assetTag: 'AT-10234', equipmentClass: 'Heat Exchanger', criticality: 'A', installationDate: '2018-08-10', warrantyExpiryDate: '2023-08-10', operationalStatus: 'Active', technicalParameters: { 'Heat Duty': '5.2 MW', 'Shell Design P': '25 bar', 'Tube Design P': '40 bar', 'Surface Area': '250 m²' }, createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { equipmentId: 'EQ-007', equipmentCode: 'C-201', name: 'Distillation Column 201', description: 'Main distillation column for product separation', functionalLocationId: 'FL-007', manufacturer: 'Doosan', model: 'DC-3000', serialNumber: 'SN-2018-0267', assetTag: 'AT-10267', equipmentClass: 'Column', criticality: 'A', installationDate: '2018-08-01', warrantyExpiryDate: '2028-08-01', operationalStatus: 'Active', technicalParameters: { 'Height': '45 m', 'Diameter': '2.5 m', 'Trays': '45', 'Design Pressure': '20 bar', 'Design Temp': '300°C' }, createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { equipmentId: 'EQ-008', equipmentCode: 'B-301A', name: 'Boiler 301A', description: 'Package boiler for steam generation', functionalLocationId: 'FL-009', manufacturer: 'Cleaver-Brooks', model: 'CB-700-250', serialNumber: 'SN-2018-0301', assetTag: 'AT-10301', equipmentClass: 'Boiler', criticality: 'A', installationDate: '2018-04-10', warrantyExpiryDate: '2023-04-10', operationalStatus: 'Active', technicalParameters: { 'Steam Capacity': '25000 kg/h', 'Pressure': '15 bar', 'Efficiency': '92%', 'Fuel': 'Natural Gas' }, createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { equipmentId: 'EQ-009', equipmentCode: 'B-301B', name: 'Boiler 301B', description: 'Standby package boiler', functionalLocationId: 'FL-009', manufacturer: 'Cleaver-Brooks', model: 'CB-700-250', serialNumber: 'SN-2018-0302', assetTag: 'AT-10302', equipmentClass: 'Boiler', criticality: 'B', installationDate: '2018-04-10', warrantyExpiryDate: '2023-04-10', operationalStatus: 'Inactive', technicalParameters: { 'Steam Capacity': '25000 kg/h', 'Pressure': '15 bar', 'Efficiency': '92%', 'Fuel': 'Natural Gas' }, createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { equipmentId: 'EQ-010', equipmentCode: 'CT-302A', name: 'Cooling Tower Fan 302A', description: 'Induced draft cooling tower fan', functionalLocationId: 'FL-010', manufacturer: 'Baltimore Aircoil', model: 'FXV-24', serialNumber: 'SN-2018-0345', assetTag: 'AT-10345', equipmentClass: 'Cooling Tower', criticality: 'B', installationDate: '2018-04-15', warrantyExpiryDate: '2023-04-15', operationalStatus: 'Active', technicalParameters: { 'Flow Rate': '1200 m³/h', 'Fan Power': '37 kW', 'Cells': '2' }, createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { equipmentId: 'EQ-011', equipmentCode: 'FE-101', name: 'Orifice Flow Meter 101', description: 'Differential pressure flow meter for feed line', functionalLocationId: 'FL-004', manufacturer: 'Emerson', model: 'Rosemount 3051S', serialNumber: 'SN-2019-0012', assetTag: 'AT-11012', equipmentClass: 'Instrument', criticality: 'A', installationDate: '2019-01-10', warrantyExpiryDate: '2024-01-10', operationalStatus: 'Active', technicalParameters: { 'Range': '0-200 m³/h', 'Accuracy': '±0.04%', 'Output': '4-20 mA' }, createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { equipmentId: 'EQ-012', equipmentCode: 'CV-201', name: 'Control Valve 201', description: 'Pneumatic control valve for distillate flow', functionalLocationId: 'FL-007', manufacturer: 'Samson', model: '3241 DN150', serialNumber: 'SN-2019-0056', assetTag: 'AT-11056', equipmentClass: 'Valve', criticality: 'B', installationDate: '2019-02-15', warrantyExpiryDate: '2024-02-15', operationalStatus: 'Active', technicalParameters: { 'Size': 'DN150', 'Rating': 'PN40', 'Actuator': 'Type 3730' }, createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { equipmentId: 'EQ-013', equipmentCode: 'CV-202', name: 'Control Valve 202', description: 'Pneumatic control valve for bottoms flow', functionalLocationId: 'FL-007', manufacturer: 'Samson', model: '3241 DN100', serialNumber: 'SN-2019-0057', assetTag: 'AT-11057', equipmentClass: 'Valve', criticality: 'B', installationDate: '2019-02-15', warrantyExpiryDate: '2024-02-15', operationalStatus: 'Active', technicalParameters: { 'Size': 'DN100', 'Rating': 'PN40', 'Actuator': 'Type 3730' }, createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { equipmentId: 'EQ-014', equipmentCode: 'AG-101', name: 'Agitator Gearbox 101', description: 'Gear reducer for reactor agitator', functionalLocationId: 'FL-004', manufacturer: 'Sew-Eurodrive', model: 'R107 DV180L4', serialNumber: 'SN-2018-0167', assetTag: 'AT-10167', equipmentClass: 'Gearbox', criticality: 'A', installationDate: '2018-06-01', warrantyExpiryDate: '2023-06-01', operationalStatus: 'Active', technicalParameters: { 'Ratio': '18.5:1', 'Torque': '8500 Nm', 'Service Factor': '2.0' }, createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { equipmentId: 'EQ-015', equipmentCode: 'TE-201', name: 'Temperature Element 201', description: 'RTD temperature sensor for distillation', functionalLocationId: 'FL-007', manufacturer: 'WIKA', model: 'TR10-C', serialNumber: 'SN-2019-0089', assetTag: 'AT-11089', equipmentClass: 'Instrument', criticality: 'A', installationDate: '2019-03-01', warrantyExpiryDate: '2024-03-01', operationalStatus: 'Active', technicalParameters: { 'Type': 'Pt100', 'Range': '-50 to 400°C', 'Accuracy': '±0.15°C' }, createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
];

// ─── Equipment Meters (§3.1.2) ───
export const mockMeters: EquipmentMeter[] = [
  { meterId: 'MTR-001', equipmentId: 'EQ-001', meterName: 'Running Hours', unitOfMeasure: 'hrs', lastReading: 45230, lastReadingDate: '2026-07-05T06:00:00Z', createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { meterId: 'MTR-002', equipmentId: 'EQ-001', meterName: 'Cycles', unitOfMeasure: 'cycles', lastReading: 8924500, lastReadingDate: '2026-07-05T06:00:00Z', createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { meterId: 'MTR-003', equipmentId: 'EQ-003', meterName: 'Running Hours', unitOfMeasure: 'hrs', lastReading: 45180, lastReadingDate: '2026-07-05T06:00:00Z', createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { meterId: 'MTR-004', equipmentId: 'EQ-006', meterName: 'Operating Hours', unitOfMeasure: 'hrs', lastReading: 44890, lastReadingDate: '2026-07-05T06:00:00Z', createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { meterId: 'MTR-005', equipmentId: 'EQ-008', meterName: 'Running Hours', unitOfMeasure: 'hrs', lastReading: 42350, lastReadingDate: '2026-07-05T06:00:00Z', createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
];

export const mockMeterReadings: MeterReading[] = [
  { readingId: 'RD-001', meterId: 'MTR-001', readingValue: 45230, readingDate: '2026-07-05T06:00:00Z', notes: 'Daily reading', createdBy: 'USR-004', createdDate: '2026-07-05T06:00:00Z', modifiedBy: 'USR-004', modifiedDate: '2026-07-05T06:00:00Z', isDeleted: false },
  { readingId: 'RD-002', meterId: 'MTR-001', readingValue: 45206, readingDate: '2026-07-04T06:00:00Z', notes: 'Daily reading', createdBy: 'USR-004', createdDate: '2026-07-04T06:00:00Z', modifiedBy: 'USR-004', modifiedDate: '2026-07-04T06:00:00Z', isDeleted: false },
  { readingId: 'RD-003', meterId: 'MTR-001', readingValue: 45182, readingDate: '2026-07-03T06:00:00Z', notes: 'Daily reading', createdBy: 'USR-004', createdDate: '2026-07-03T06:00:00Z', modifiedBy: 'USR-004', modifiedDate: '2026-07-03T06:00:00Z', isDeleted: false },
  { readingId: 'RD-004', meterId: 'MTR-003', readingValue: 45180, readingDate: '2026-07-05T06:00:00Z', notes: 'Daily reading', createdBy: 'USR-004', createdDate: '2026-07-05T06:00:00Z', modifiedBy: 'USR-004', modifiedDate: '2026-07-05T06:00:00Z', isDeleted: false },
  { readingId: 'RD-005', meterId: 'MTR-004', readingValue: 44890, readingDate: '2026-07-05T06:00:00Z', notes: 'Daily reading', createdBy: 'USR-005', createdDate: '2026-07-05T06:00:00Z', modifiedBy: 'USR-005', modifiedDate: '2026-07-05T06:00:00Z', isDeleted: false },
];

// ─── Work Centers (§3.1.3) ───
export const mockWorkCenters: WorkCenter[] = [
  { workCenterId: 'WC-001', code: 'MECH', name: 'Mechanical Workshop', dailyCapacityHours: 80, costRatePerHour: 65, isActive: true, createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { workCenterId: 'WC-002', code: 'ELEC', name: 'Electrical Team', dailyCapacityHours: 64, costRatePerHour: 75, isActive: true, createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { workCenterId: 'WC-003', code: 'INST', name: 'Instrumentation Team', dailyCapacityHours: 48, costRatePerHour: 80, isActive: true, createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { workCenterId: 'WC-004', code: 'ROTA', name: 'Rotating Equipment', dailyCapacityHours: 56, costRatePerHour: 70, isActive: true, createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { workCenterId: 'WC-005', code: 'PIPE', name: 'Piping & Welding', dailyCapacityHours: 48, costRatePerHour: 60, isActive: true, createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
];

// ─── Crafts (§3.1.3) ───
export const mockCrafts: Craft[] = [
  { craftId: 'CFT-001', workCenterId: 'WC-001', craftCode: 'FITT', description: 'Pipe Fitter', hourlyRate: 65, createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { craftId: 'CFT-002', workCenterId: 'WC-001', craftCode: 'MECH', description: 'Mechanical Technician', hourlyRate: 68, createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { craftId: 'CFT-003', workCenterId: 'WC-002', craftCode: 'ELEC', description: 'Electrician', hourlyRate: 75, createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { craftId: 'CFT-004', workCenterId: 'WC-002', craftCode: 'HVAT', description: 'HV Technician', hourlyRate: 85, createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { craftId: 'CFT-005', workCenterId: 'WC-003', craftCode: 'INST', description: 'Instrument Technician', hourlyRate: 80, createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { craftId: 'CFT-006', workCenterId: 'WC-004', craftCode: 'ROTA', description: 'Rotating Equipment Tech', hourlyRate: 72, createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { craftId: 'CFT-007', workCenterId: 'WC-004', craftCode: 'ALIGN', description: 'Alignment Specialist', hourlyRate: 78, createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { craftId: 'CFT-008', workCenterId: 'WC-005', craftCode: 'WELD', description: 'Welder', hourlyRate: 60, createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { craftId: 'CFT-009', workCenterId: 'WC-005', craftCode: 'NDT', description: 'NDT Inspector', hourlyRate: 82, createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
];

// ─── Materials (§3.1.5) ───
export const mockMaterials: Material[] = [
  { materialId: 'MAT-001', materialCode: 'MECH-SEAL-001', description: 'Mechanical Seal Type A - 50mm', unitOfMeasure: 'EA', standardCost: 450, currentStock: 8, createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { materialId: 'MAT-002', materialCode: 'BEARING-001', description: 'Deep Groove Ball Bearing 6314', unitOfMeasure: 'EA', standardCost: 120, currentStock: 15, createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { materialId: 'MAT-003', materialCode: 'BEARING-002', description: 'Cylindrical Roller Bearing NU314', unitOfMeasure: 'EA', standardCost: 180, currentStock: 6, createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { materialId: 'MAT-004', materialCode: 'OIL-001', description: 'Turbine Oil ISO VG 68 - 205L', unitOfMeasure: 'DR', standardCost: 850, currentStock: 12, createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { materialId: 'MAT-005', materialCode: 'GASKET-001', description: 'Spiral Wound Gasket DN150 PN40', unitOfMeasure: 'EA', standardCost: 35, currentStock: 25, createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { materialId: 'MAT-006', materialCode: 'GASKET-002', description: 'Spiral Wound Gasket DN100 PN40', unitOfMeasure: 'EA', standardCost: 28, currentStock: 20, createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { materialId: 'MAT-007', materialCode: 'VALVE-001', description: 'Ball Valve DN50 PN40 CS', unitOfMeasure: 'EA', standardCost: 320, currentStock: 10, createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { materialId: 'MAT-008', materialCode: 'COUPLING-001', description: 'Flexible Coupling 80mm', unitOfMeasure: 'EA', standardCost: 650, currentStock: 4, createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { materialId: 'MAT-009', materialCode: 'FILTER-001', description: 'Oil Filter Element 10 micron', unitOfMeasure: 'EA', standardCost: 95, currentStock: 18, createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { materialId: 'MAT-010', materialCode: 'V-BELT-001', description: 'V-Belt SPA 3150', unitOfMeasure: 'EA', standardCost: 45, currentStock: 10, createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
];

// ─── Failure Codes (§3.1.4) ───
export const mockFailureCodes: FailureCode[] = [
  { failureCodeId: 'FC-001', parentCodeId: null, code: 'MECH', description: 'Mechanical', createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { failureCodeId: 'FC-002', parentCodeId: 'FC-001', code: 'MECH-VIB', description: 'Vibration', createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { failureCodeId: 'FC-003', parentCodeId: 'FC-002', code: 'MECH-VIB-MIS', description: 'Misalignment', createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { failureCodeId: 'FC-004', parentCodeId: 'FC-002', code: 'MECH-VIB-UNB', description: 'Unbalance', createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { failureCodeId: 'FC-005', parentCodeId: 'FC-002', code: 'MECH-VIB-LOO', description: 'Looseness', createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { failureCodeId: 'FC-006', parentCodeId: 'FC-001', code: 'MECH-LEAK', description: 'Leakage', createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { failureCodeId: 'FC-007', parentCodeId: 'FC-001', code: 'MECH-WEAR', description: 'Wear', createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { failureCodeId: 'FC-008', parentCodeId: null, code: 'ELEC', description: 'Electrical', createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { failureCodeId: 'FC-009', parentCodeId: 'FC-008', code: 'ELEC-MOT', description: 'Motor Fault', createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { failureCodeId: 'FC-010', parentCodeId: 'FC-008', code: 'ELEC-INS', description: 'Insulation Failure', createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { failureCodeId: 'FC-011', parentCodeId: null, code: 'INST', description: 'Instrumentation', createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { failureCodeId: 'FC-012', parentCodeId: 'FC-011', code: 'INST-DRIFT', description: 'Sensor Drift', createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { failureCodeId: 'FC-013', parentCodeId: 'FC-011', code: 'INST-FAIL', description: 'Complete Failure', createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
];

// ─── Cause Codes (§3.1.4) ───
export const mockCauseCodes: CauseCode[] = [
  { causeCodeId: 'CC-001', code: 'WEAR', description: 'Wear & Tear', createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { causeCodeId: 'CC-002', code: 'OPERR', description: 'Operator Error', createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { causeCodeId: 'CC-003', code: 'DESGN', description: 'Design Defect', createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { causeCodeId: 'CC-004', code: 'MAINT', description: 'Inadequate Maintenance', createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { causeCodeId: 'CC-005', code: 'AGING', description: 'Age Deterioration', createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { causeCodeId: 'CC-006', code: 'EXTRN', description: 'External Factor', createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { causeCodeId: 'CC-007', code: 'FAB', description: 'Fabrication Defect', createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { causeCodeId: 'CC-008', code: 'CORRO', description: 'Corrosion', createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { causeCodeId: 'CC-009', code: 'ERO', description: 'Erosion', createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { causeCodeId: 'CC-010', code: 'FOREIGN', description: 'Foreign Object Damage', createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
];

// ─── Task Lists (§3.1.4) ───
export const mockTaskLists: TaskList[] = [
  { taskListId: 'TL-001', code: 'TL-PUMP-PM', description: 'Centrifugal Pump - Preventive Maintenance', equipmentClass: 'Pump', equipmentId: null, createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { taskListId: 'TL-002', code: 'TL-MOTOR-PM', description: 'Electric Motor - Preventive Maintenance', equipmentClass: 'Motor', equipmentId: null, createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { taskListId: 'TL-003', code: 'TL-HX-PM', description: 'Heat Exchanger - Preventive Maintenance', equipmentClass: 'Heat Exchanger', equipmentId: null, createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { taskListId: 'TL-004', code: 'TL-INST-CAL', description: 'Instrument - Calibration Procedure', equipmentClass: 'Instrument', equipmentId: null, createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { taskListId: 'TL-005', code: 'TL-PUMP-OH', description: 'Centrifugal Pump - Overhaul', equipmentClass: 'Pump', equipmentId: null, createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
];

export const mockTaskListOperations: TaskListOperation[] = [
  { taskOperationId: 'TLO-001', taskListId: 'TL-001', sequenceNumber: 10, description: 'Check pump vibration levels', craftId: 'CFT-006', plannedHours: 0.5, numberOfTechnicians: 1, createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { taskOperationId: 'TLO-002', taskListId: 'TL-001', sequenceNumber: 20, description: 'Check bearing temperatures', craftId: 'CFT-006', plannedHours: 0.5, numberOfTechnicians: 1, createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { taskOperationId: 'TLO-003', taskListId: 'TL-001', sequenceNumber: 30, description: 'Check seal leakage', craftId: 'CFT-006', plannedHours: 0.25, numberOfTechnicians: 1, createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { taskOperationId: 'TLO-004', taskListId: 'TL-001', sequenceNumber: 40, description: 'Lubricate bearings', craftId: 'CFT-006', plannedHours: 1.0, numberOfTechnicians: 1, createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { taskOperationId: 'TLO-005', taskListId: 'TL-001', sequenceNumber: 50, description: 'Check coupling condition', craftId: 'CFT-006', plannedHours: 0.5, numberOfTechnicians: 1, createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { taskOperationId: 'TLO-006', taskListId: 'TL-002', sequenceNumber: 10, description: 'Check motor winding resistance', craftId: 'CFT-004', plannedHours: 1.0, numberOfTechnicians: 1, createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { taskOperationId: 'TLO-007', taskListId: 'TL-002', sequenceNumber: 20, description: 'Check bearing temperatures and vibration', craftId: 'CFT-006', plannedHours: 0.5, numberOfTechnicians: 1, createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { taskOperationId: 'TLO-008', taskListId: 'TL-002', sequenceNumber: 30, description: 'Check terminal connections', craftId: 'CFT-003', plannedHours: 0.5, numberOfTechnicians: 1, createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { taskOperationId: 'TLO-009', taskListId: 'TL-002', sequenceNumber: 40, description: 'Clean cooling fins and fan', craftId: 'CFT-002', plannedHours: 1.0, numberOfTechnicians: 1, createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { taskOperationId: 'TLO-010', taskListId: 'TL-003', sequenceNumber: 10, description: 'Inspect tube bundle for fouling', craftId: 'CFT-002', plannedHours: 4.0, numberOfTechnicians: 2, createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { taskOperationId: 'TLO-011', taskListId: 'TL-003', sequenceNumber: 20, description: 'Check gasket condition', craftId: 'CFT-001', plannedHours: 1.0, numberOfTechnicians: 1, createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { taskOperationId: 'TLO-012', taskListId: 'TL-003', sequenceNumber: 30, description: 'Hydrostatic test', craftId: 'CFT-009', plannedHours: 2.0, numberOfTechnicians: 1, createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { taskOperationId: 'TLO-013', taskListId: 'TL-004', sequenceNumber: 10, description: 'Calibrate 4-20mA output', craftId: 'CFT-005', plannedHours: 1.0, numberOfTechnicians: 1, createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { taskOperationId: 'TLO-014', taskListId: 'TL-004', sequenceNumber: 20, description: 'Verify span and zero points', craftId: 'CFT-005', plannedHours: 1.5, numberOfTechnicians: 1, createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { taskOperationId: 'TLO-015', taskListId: 'TL-004', sequenceNumber: 30, description: 'Issue calibration certificate', craftId: 'CFT-005', plannedHours: 0.5, numberOfTechnicians: 1, createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
];

// ─── Notifications (§3.2) ───
export const mockNotifications: Notification[] = [
  { notificationId: 'NOT-001', notificationNumber: '10000001', type: 'M1', priority: 'High', functionalLocationId: 'FL-004', equipmentId: 'EQ-001', reportedByUserId: 'USR-006', description: 'Unusual vibration detected on Reactor Feed Pump 101A. Bearing temperature elevated to 78°C.', breakdownFlag: false, status: 'Open', workOrderIds: [], createdBy: 'USR-006', createdDate: '2026-07-04T14:30:00Z', modifiedBy: 'USR-006', modifiedDate: '2026-07-04T14:30:00Z', isDeleted: false },
  { notificationId: 'NOT-002', notificationNumber: '10000002', type: 'M1', priority: 'High', functionalLocationId: 'FL-004', equipmentId: 'EQ-003', reportedByUserId: 'USR-006', description: 'Reactor 101 agitator motor tripped on overload. High current alarm before trip.', breakdownFlag: true, status: 'Converted', workOrderIds: ['WO-005'], createdBy: 'USR-006', createdDate: '2026-07-03T08:15:00Z', modifiedBy: 'USR-006', modifiedDate: '2026-07-03T09:00:00Z', isDeleted: false },
  { notificationId: 'NOT-003', notificationNumber: '10000003', type: 'M2', priority: 'Medium', functionalLocationId: 'FL-007', equipmentId: 'EQ-006', reportedByUserId: 'USR-002', description: 'Schedule preventive maintenance for Reboiler 201. Due based on time interval.', breakdownFlag: false, status: 'Converted', workOrderIds: ['WO-003'], createdBy: 'USR-002', createdDate: '2026-07-02T10:00:00Z', modifiedBy: 'USR-002', modifiedDate: '2026-07-02T10:30:00Z', isDeleted: false },
  { notificationId: 'NOT-004', notificationNumber: '10000004', type: 'M1', priority: 'Low', functionalLocationId: 'FL-010', equipmentId: 'EQ-010', reportedByUserId: 'USR-006', description: 'Cooling tower fan 302A making unusual noise. Possibly belt worn.', breakdownFlag: false, status: 'In Process', workOrderIds: ['WO-006'], createdBy: 'USR-006', createdDate: '2026-07-01T16:45:00Z', modifiedBy: 'USR-006', modifiedDate: '2026-07-01T17:00:00Z', isDeleted: false },
  { notificationId: 'NOT-005', notificationNumber: '10000005', type: 'M1', priority: 'High', functionalLocationId: 'FL-007', equipmentId: 'EQ-007', reportedByUserId: 'USR-006', description: 'Pressure drop across distillation column 201 is abnormally high. Possible tray damage.', breakdownFlag: false, status: 'Open', workOrderIds: [], createdBy: 'USR-006', createdDate: '2026-07-05T09:30:00Z', modifiedBy: 'USR-006', modifiedDate: '2026-07-05T09:30:00Z', isDeleted: false },
  { notificationId: 'NOT-006', notificationNumber: '10000006', type: 'M2', priority: 'Medium', functionalLocationId: 'FL-009', equipmentId: 'EQ-008', reportedByUserId: 'USR-002', description: 'Annual inspection of Boiler 301A is due. Schedule shutdown for internal inspection.', breakdownFlag: false, status: 'Open', workOrderIds: [], createdBy: 'USR-002', createdDate: '2026-07-01T08:00:00Z', modifiedBy: 'USR-002', modifiedDate: '2026-07-01T08:00:00Z', isDeleted: false },
  { notificationId: 'NOT-007', notificationNumber: '10000007', type: 'M1', priority: 'Low', functionalLocationId: 'FL-012', equipmentId: null, reportedByUserId: 'USR-006', description: 'Lighting fixture in spare parts store flickering intermittently.', breakdownFlag: false, status: 'Completed', workOrderIds: ['WO-007'], createdBy: 'USR-006', createdDate: '2026-06-28T11:00:00Z', modifiedBy: 'USR-006', modifiedDate: '2026-06-29T14:00:00Z', isDeleted: false },
  { notificationId: 'NOT-008', notificationNumber: '10000008', type: 'M1', priority: 'High', functionalLocationId: 'FL-004', equipmentId: 'EQ-014', reportedByUserId: 'USR-006', description: 'Agitator gearbox 101 oil leak detected. Oil puddle forming on baseplate.', breakdownFlag: false, status: 'Converted', workOrderIds: ['WO-002'], createdBy: 'USR-006', createdDate: '2026-07-02T07:30:00Z', modifiedBy: 'USR-006', modifiedDate: '2026-07-02T08:00:00Z', isDeleted: false },
  { notificationId: 'NOT-009', notificationNumber: '10000009', type: 'M2', priority: 'Medium', functionalLocationId: 'FL-004', equipmentId: 'EQ-011', reportedByUserId: 'USR-002', description: 'Flow meter 101 calibration due. Last calibrated on 2026-01-10.', breakdownFlag: false, status: 'Open', workOrderIds: [], createdBy: 'USR-002', createdDate: '2026-07-05T07:00:00Z', modifiedBy: 'USR-002', modifiedDate: '2026-07-05T07:00:00Z', isDeleted: false },
  { notificationId: 'NOT-010', notificationNumber: '10000010', type: 'M1', priority: 'Medium', functionalLocationId: 'FL-005', equipmentId: 'EQ-005', reportedByUserId: 'USR-006', description: 'Reactor 102 discharge pump seal showing minor leakage. Approx 2 drops per minute.', breakdownFlag: false, status: 'In Process', workOrderIds: ['WO-008'], createdBy: 'USR-006', createdDate: '2026-06-30T13:20:00Z', modifiedBy: 'USR-006', modifiedDate: '2026-06-30T13:30:00Z', isDeleted: false },
];

// ─── Work Orders (§3.3) ───
export const mockWorkOrders: WorkOrder[] = [
  { workOrderId: 'WO-001', woNumber: 'WO-2026-0001', type: 'PM', priority: 'Medium', status: 'In Progress', functionalLocationId: 'FL-004', equipmentId: 'EQ-001', description: 'Quarterly PM - Reactor Feed Pump 101A', workCenterId: 'WC-004', supervisorUserId: 'USR-003', plannedStart: '2026-07-05T08:00:00Z', plannedFinish: '2026-07-05T14:00:00Z', actualStart: '2026-07-05T08:15:00Z', actualFinish: null, costCenterCode: 'CC-PROD-01', internalOrder: 'IO-2026-0045', breakdownFlag: false, safetyCriticalFlag: true, plannedCost: 2680, actualCost: 2150, createdBy: 'USR-002', createdDate: '2026-07-01T09:00:00Z', modifiedBy: 'USR-003', modifiedDate: '2026-07-05T08:15:00Z', isDeleted: false },
  { workOrderId: 'WO-002', woNumber: 'WO-2026-0002', type: 'CM', priority: 'High', status: 'Scheduled', functionalLocationId: 'FL-004', equipmentId: 'EQ-014', description: 'Repair oil leak on Agitator Gearbox 101', workCenterId: 'WC-001', supervisorUserId: 'USR-003', plannedStart: '2026-07-06T08:00:00Z', plannedFinish: '2026-07-06T16:00:00Z', actualStart: null, actualFinish: null, costCenterCode: 'CC-PROD-01', internalOrder: 'IO-2026-0046', breakdownFlag: false, safetyCriticalFlag: true, plannedCost: 4200, actualCost: 0, createdBy: 'USR-002', createdDate: '2026-07-02T08:00:00Z', modifiedBy: 'USR-002', modifiedDate: '2026-07-02T08:00:00Z', isDeleted: false },
  { workOrderId: 'WO-003', woNumber: 'WO-2026-0003', type: 'PM', priority: 'Medium', status: 'Planned', functionalLocationId: 'FL-007', equipmentId: 'EQ-006', description: 'Annual PM - Distillation Reboiler 201', workCenterId: 'WC-001', supervisorUserId: 'USR-003', plannedStart: '2026-07-10T08:00:00Z', plannedFinish: '2026-07-12T16:00:00Z', actualStart: null, actualFinish: null, costCenterCode: 'CC-PROD-02', internalOrder: 'IO-2026-0047', breakdownFlag: false, safetyCriticalFlag: true, plannedCost: 18500, actualCost: 0, createdBy: 'USR-002', createdDate: '2026-07-02T10:30:00Z', modifiedBy: 'USR-002', modifiedDate: '2026-07-02T10:30:00Z', isDeleted: false },
  { workOrderId: 'WO-004', woNumber: 'WO-2026-0004', type: 'CAL', priority: 'Medium', status: 'In Progress', functionalLocationId: 'FL-004', equipmentId: 'EQ-011', description: 'Calibration of Flow Meter 101', workCenterId: 'WC-003', supervisorUserId: 'USR-003', plannedStart: '2026-07-05T09:00:00Z', plannedFinish: '2026-07-05T13:00:00Z', actualStart: '2026-07-05T09:30:00Z', actualFinish: null, costCenterCode: 'CC-PROD-01', internalOrder: 'IO-2026-0048', breakdownFlag: false, safetyCriticalFlag: false, plannedCost: 1200, actualCost: 800, createdBy: 'USR-002', createdDate: '2026-07-03T11:00:00Z', modifiedBy: 'USR-004', modifiedDate: '2026-07-05T09:30:00Z', isDeleted: false },
  { workOrderId: 'WO-005', woNumber: 'WO-2026-0005', type: 'EM', priority: 'High', status: 'In Progress', functionalLocationId: 'FL-004', equipmentId: 'EQ-003', description: 'Emergency repair - Reactor 101 Agitator Motor', workCenterId: 'WC-002', supervisorUserId: 'USR-003', plannedStart: '2026-07-03T08:30:00Z', plannedFinish: '2026-07-03T18:00:00Z', actualStart: '2026-07-03T08:30:00Z', actualFinish: null, costCenterCode: 'CC-PROD-01', internalOrder: 'IO-2026-0049', breakdownFlag: true, safetyCriticalFlag: true, plannedCost: 8500, actualCost: 6200, createdBy: 'USR-002', createdDate: '2026-07-03T09:00:00Z', modifiedBy: 'USR-003', modifiedDate: '2026-07-03T08:30:00Z', isDeleted: false },
  { workOrderId: 'WO-006', woNumber: 'WO-2026-0006', type: 'CM', priority: 'Medium', status: 'In Progress', functionalLocationId: 'FL-010', equipmentId: 'EQ-010', description: 'Replace worn belt on Cooling Tower Fan 302A', workCenterId: 'WC-001', supervisorUserId: 'USR-003', plannedStart: '2026-07-05T07:00:00Z', plannedFinish: '2026-07-05T11:00:00Z', actualStart: '2026-07-05T07:30:00Z', actualFinish: null, costCenterCode: 'CC-UTIL-01', internalOrder: 'IO-2026-0050', breakdownFlag: false, safetyCriticalFlag: false, plannedCost: 850, actualCost: 320, createdBy: 'USR-002', createdDate: '2026-07-01T17:00:00Z', modifiedBy: 'USR-004', modifiedDate: '2026-07-05T07:30:00Z', isDeleted: false },
  { workOrderId: 'WO-007', woNumber: 'WO-2026-0007', type: 'CM', priority: 'Low', status: 'Closed', functionalLocationId: 'FL-012', equipmentId: null, description: 'Replace faulty lighting fixture in spare parts store', workCenterId: 'WC-002', supervisorUserId: 'USR-003', plannedStart: '2026-06-29T09:00:00Z', plannedFinish: '2026-06-29T11:00:00Z', actualStart: '2026-06-29T09:15:00Z', actualFinish: '2026-06-29T10:30:00Z', costCenterCode: 'CC-FAC-01', internalOrder: 'IO-2026-0051', breakdownFlag: false, safetyCriticalFlag: false, plannedCost: 320, actualCost: 285, createdBy: 'USR-002', createdDate: '2026-06-28T11:30:00Z', modifiedBy: 'USR-003', modifiedDate: '2026-06-29T14:00:00Z', isDeleted: false },
  { workOrderId: 'WO-008', woNumber: 'WO-2026-0008', type: 'CM', priority: 'Medium', status: 'Scheduled', functionalLocationId: 'FL-005', equipmentId: 'EQ-005', description: 'Replace mechanical seal on Reactor 102 Discharge Pump', workCenterId: 'WC-004', supervisorUserId: 'USR-003', plannedStart: '2026-07-08T08:00:00Z', plannedFinish: '2026-07-08T16:00:00Z', actualStart: null, actualFinish: null, costCenterCode: 'CC-PROD-01', internalOrder: 'IO-2026-0052', breakdownFlag: false, safetyCriticalFlag: false, plannedCost: 5200, actualCost: 0, createdBy: 'USR-002', createdDate: '2026-06-30T14:00:00Z', modifiedBy: 'USR-002', modifiedDate: '2026-06-30T14:00:00Z', isDeleted: false },
  { workOrderId: 'WO-009', woNumber: 'WO-2026-0009', type: 'PM', priority: 'Medium', status: 'Planned', functionalLocationId: 'FL-009', equipmentId: 'EQ-008', description: 'Annual Inspection - Boiler 301A', workCenterId: 'WC-001', supervisorUserId: 'USR-003', plannedStart: '2026-07-15T08:00:00Z', plannedFinish: '2026-07-18T16:00:00Z', actualStart: null, actualFinish: null, costCenterCode: 'CC-UTIL-01', internalOrder: 'IO-2026-0053', breakdownFlag: false, safetyCriticalFlag: true, plannedCost: 28000, actualCost: 0, createdBy: 'USR-002', createdDate: '2026-07-01T08:30:00Z', modifiedBy: 'USR-002', modifiedDate: '2026-07-01T08:30:00Z', isDeleted: false },
  { workOrderId: 'WO-010', woNumber: 'WO-2026-0010', type: 'CM', priority: 'High', status: 'Draft', functionalLocationId: 'FL-007', equipmentId: 'EQ-007', description: 'Investigate high pressure drop across Distillation Column 201', workCenterId: 'WC-001', supervisorUserId: 'USR-003', plannedStart: null, plannedFinish: null, actualStart: null, actualFinish: null, costCenterCode: 'CC-PROD-02', internalOrder: 'IO-2026-0054', breakdownFlag: false, safetyCriticalFlag: true, plannedCost: 15000, actualCost: 0, createdBy: 'USR-002', createdDate: '2026-07-05T10:00:00Z', modifiedBy: 'USR-002', modifiedDate: '2026-07-05T10:00:00Z', isDeleted: false },
  { workOrderId: 'WO-011', woNumber: 'WO-2026-0011', type: 'PM', priority: 'Medium', status: 'In Progress', functionalLocationId: 'FL-004', equipmentId: 'EQ-003', description: 'Monthly PM - Reactor 101 Agitator Motor', workCenterId: 'WC-004', supervisorUserId: 'USR-003', plannedStart: '2026-07-05T14:00:00Z', plannedFinish: '2026-07-05T18:00:00Z', actualStart: '2026-07-05T14:00:00Z', actualFinish: null, costCenterCode: 'CC-PROD-01', internalOrder: 'IO-2026-0055', breakdownFlag: false, safetyCriticalFlag: true, plannedCost: 2100, actualCost: 1200, createdBy: 'USR-002', createdDate: '2026-07-04T10:00:00Z', modifiedBy: 'USR-003', modifiedDate: '2026-07-05T14:00:00Z', isDeleted: false },
  { workOrderId: 'WO-012', woNumber: 'WO-2026-0012', type: 'CAL', priority: 'Low', status: 'Planned', functionalLocationId: 'FL-007', equipmentId: 'EQ-015', description: 'Calibration of Temperature Element 201', workCenterId: 'WC-003', supervisorUserId: 'USR-003', plannedStart: '2026-07-12T09:00:00Z', plannedFinish: '2026-07-12T12:00:00Z', actualStart: null, actualFinish: null, costCenterCode: 'CC-PROD-02', internalOrder: 'IO-2026-0056', breakdownFlag: false, safetyCriticalFlag: false, plannedCost: 950, actualCost: 0, createdBy: 'USR-002', createdDate: '2026-07-05T08:00:00Z', modifiedBy: 'USR-002', modifiedDate: '2026-07-05T08:00:00Z', isDeleted: false },
  { workOrderId: 'WO-013', woNumber: 'WO-2026-0013', type: 'PM', priority: 'Low', status: 'Completed', functionalLocationId: 'FL-010', equipmentId: 'EQ-010', description: 'Monthly PM - Cooling Tower Fan 302A', workCenterId: 'WC-001', supervisorUserId: 'USR-003', plannedStart: '2026-06-20T08:00:00Z', plannedFinish: '2026-06-20T12:00:00Z', actualStart: '2026-06-20T08:00:00Z', actualFinish: '2026-06-20T11:30:00Z', costCenterCode: 'CC-UTIL-01', internalOrder: 'IO-2026-0057', breakdownFlag: false, safetyCriticalFlag: false, plannedCost: 650, actualCost: 580, createdBy: 'USR-002', createdDate: '2026-06-15T09:00:00Z', modifiedBy: 'USR-003', modifiedDate: '2026-06-20T14:00:00Z', isDeleted: false },
  { workOrderId: 'WO-014', woNumber: 'WO-2026-0014', type: 'CM', priority: 'High', status: 'Suspended', functionalLocationId: 'FL-007', equipmentId: 'EQ-012', description: 'Control Valve 201 actuator not responding', workCenterId: 'WC-003', supervisorUserId: 'USR-003', plannedStart: '2026-07-04T10:00:00Z', plannedFinish: '2026-07-04T16:00:00Z', actualStart: '2026-07-04T10:15:00Z', actualFinish: null, costCenterCode: 'CC-PROD-02', internalOrder: 'IO-2026-0058', breakdownFlag: false, safetyCriticalFlag: true, plannedCost: 3500, actualCost: 1200, createdBy: 'USR-002', createdDate: '2026-07-04T09:30:00Z', modifiedBy: 'USR-003', modifiedDate: '2026-07-04T14:00:00Z', isDeleted: false },
  { workOrderId: 'WO-015', woNumber: 'WO-2026-0015', type: 'PM', priority: 'Medium', status: 'In Progress', functionalLocationId: 'FL-004', equipmentId: 'EQ-002', description: 'Quarterly PM - Reactor Feed Pump 101B', workCenterId: 'WC-004', supervisorUserId: 'USR-003', plannedStart: '2026-07-05T10:00:00Z', plannedFinish: '2026-07-05T16:00:00Z', actualStart: '2026-07-05T10:00:00Z', actualFinish: null, costCenterCode: 'CC-PROD-01', internalOrder: 'IO-2026-0059', breakdownFlag: false, safetyCriticalFlag: true, plannedCost: 2680, actualCost: 1800, createdBy: 'USR-002', createdDate: '2026-07-01T09:30:00Z', modifiedBy: 'USR-004', modifiedDate: '2026-07-05T10:00:00Z', isDeleted: false },
  { workOrderId: 'WO-016', woNumber: 'WO-2026-0016', type: 'CM', priority: 'Medium', status: 'Draft', functionalLocationId: 'FL-009', equipmentId: 'EQ-009', description: 'Commissioning check for Boiler 301B after extended standby', workCenterId: 'WC-001', supervisorUserId: 'USR-003', plannedStart: null, plannedFinish: null, actualStart: null, actualFinish: null, costCenterCode: 'CC-UTIL-01', internalOrder: 'IO-2026-0060', breakdownFlag: false, safetyCriticalFlag: false, plannedCost: 4500, actualCost: 0, createdBy: 'USR-002', createdDate: '2026-07-05T11:00:00Z', modifiedBy: 'USR-002', modifiedDate: '2026-07-05T11:00:00Z', isDeleted: false },
  { workOrderId: 'WO-017', woNumber: 'WO-2026-0017', type: 'PdM', priority: 'High', status: 'Scheduled', functionalLocationId: 'FL-004', equipmentId: 'EQ-001', description: 'Vibration analysis follow-up - P-101A bearing replacement', workCenterId: 'WC-004', supervisorUserId: 'USR-003', plannedStart: '2026-07-07T08:00:00Z', plannedFinish: '2026-07-07T16:00:00Z', actualStart: null, actualFinish: null, costCenterCode: 'CC-PROD-01', internalOrder: 'IO-2026-0061', breakdownFlag: false, safetyCriticalFlag: true, plannedCost: 8500, actualCost: 0, createdBy: 'USR-002', createdDate: '2026-07-05T12:00:00Z', modifiedBy: 'USR-002', modifiedDate: '2026-07-05T12:00:00Z', isDeleted: false },
  { workOrderId: 'WO-018', woNumber: 'WO-2026-0018', type: 'PM', priority: 'Low', status: 'Planned', functionalLocationId: 'FL-007', equipmentId: 'EQ-013', description: 'Quarterly PM - Control Valve 202', workCenterId: 'WC-003', supervisorUserId: 'USR-003', plannedStart: '2026-07-20T09:00:00Z', plannedFinish: '2026-07-20T13:00:00Z', actualStart: null, actualFinish: null, costCenterCode: 'CC-PROD-02', internalOrder: 'IO-2026-0062', breakdownFlag: false, safetyCriticalFlag: false, plannedCost: 1200, actualCost: 0, createdBy: 'USR-002', createdDate: '2026-07-05T13:00:00Z', modifiedBy: 'USR-002', modifiedDate: '2026-07-05T13:00:00Z', isDeleted: false },
  { workOrderId: 'WO-019', woNumber: 'WO-2026-0019', type: 'CM', priority: 'Medium', status: 'In Progress', functionalLocationId: 'FL-005', equipmentId: null, description: 'Replace gasket on flange connection in Reactor 102 discharge line', workCenterId: 'WC-005', supervisorUserId: 'USR-003', plannedStart: '2026-07-05T08:00:00Z', plannedFinish: '2026-07-05T12:00:00Z', actualStart: '2026-07-05T08:30:00Z', actualFinish: null, costCenterCode: 'CC-PROD-01', internalOrder: 'IO-2026-0063', breakdownFlag: false, safetyCriticalFlag: false, plannedCost: 1800, actualCost: 950, createdBy: 'USR-002', createdDate: '2026-07-04T15:00:00Z', modifiedBy: 'USR-005', modifiedDate: '2026-07-05T08:30:00Z', isDeleted: false },
  { workOrderId: 'WO-020', woNumber: 'WO-2026-0020', type: 'PM', priority: 'Medium', status: 'Closed', functionalLocationId: 'FL-004', equipmentId: 'EQ-004', description: 'Annual internal inspection - Reactor 101 Pressure Vessel', workCenterId: 'WC-001', supervisorUserId: 'USR-003', plannedStart: '2026-05-15T08:00:00Z', plannedFinish: '2026-05-18T16:00:00Z', actualStart: '2026-05-15T08:00:00Z', actualFinish: '2026-05-18T14:00:00Z', costCenterCode: 'CC-PROD-01', internalOrder: 'IO-2026-0064', breakdownFlag: false, safetyCriticalFlag: true, plannedCost: 35000, actualCost: 32800, createdBy: 'USR-002', createdDate: '2026-05-01T10:00:00Z', modifiedBy: 'USR-003', modifiedDate: '2026-05-18T16:00:00Z', isDeleted: false },
];

// ─── Work Order Operations ───
export const mockWorkOrderOperations: WorkOrderOperation[] = [
  { operationId: 'OP-001', workOrderId: 'WO-001', sequenceNumber: 10, description: 'Check pump vibration levels', craftId: 'CFT-006', plannedHours: 0.5, numberOfTechnicians: 1, actualHours: 0.5, status: 'Completed' },
  { operationId: 'OP-002', workOrderId: 'WO-001', sequenceNumber: 20, description: 'Check bearing temperatures', craftId: 'CFT-006', plannedHours: 0.5, numberOfTechnicians: 1, actualHours: 0.5, status: 'Completed' },
  { operationId: 'OP-003', workOrderId: 'WO-001', sequenceNumber: 30, description: 'Check seal leakage', craftId: 'CFT-006', plannedHours: 0.25, numberOfTechnicians: 1, actualHours: 0.25, status: 'Completed' },
  { operationId: 'OP-004', workOrderId: 'WO-001', sequenceNumber: 40, description: 'Lubricate bearings', craftId: 'CFT-006', plannedHours: 1.0, numberOfTechnicians: 1, actualHours: 1.0, status: 'In Progress' },
  { operationId: 'OP-005', workOrderId: 'WO-001', sequenceNumber: 50, description: 'Check coupling condition', craftId: 'CFT-006', plannedHours: 0.5, numberOfTechnicians: 1, actualHours: 0, status: 'Pending' },
  { operationId: 'OP-006', workOrderId: 'WO-002', sequenceNumber: 10, description: 'Drain gearbox oil', craftId: 'CFT-002', plannedHours: 1.0, numberOfTechnicians: 1, actualHours: 0, status: 'Pending' },
  { operationId: 'OP-007', workOrderId: 'WO-002', sequenceNumber: 20, description: 'Inspect seal and gasket', craftId: 'CFT-002', plannedHours: 1.0, numberOfTechnicians: 1, actualHours: 0, status: 'Pending' },
  { operationId: 'OP-008', workOrderId: 'WO-002', sequenceNumber: 30, description: 'Replace oil seal', craftId: 'CFT-002', plannedHours: 2.0, numberOfTechnicians: 1, actualHours: 0, status: 'Pending' },
  { operationId: 'OP-009', workOrderId: 'WO-002', sequenceNumber: 40, description: 'Refill with new oil', craftId: 'CFT-002', plannedHours: 0.5, numberOfTechnicians: 1, actualHours: 0, status: 'Pending' },
  { operationId: 'OP-010', workOrderId: 'WO-003', sequenceNumber: 10, description: 'Inspect tube bundle for fouling', craftId: 'CFT-002', plannedHours: 4.0, numberOfTechnicians: 2, actualHours: 0, status: 'Pending' },
  { operationId: 'OP-011', workOrderId: 'WO-003', sequenceNumber: 20, description: 'Check gasket condition', craftId: 'CFT-001', plannedHours: 1.0, numberOfTechnicians: 1, actualHours: 0, status: 'Pending' },
  { operationId: 'OP-012', workOrderId: 'WO-003', sequenceNumber: 30, description: 'Hydrostatic test', craftId: 'CFT-009', plannedHours: 2.0, numberOfTechnicians: 1, actualHours: 0, status: 'Pending' },
  { operationId: 'OP-013', workOrderId: 'WO-005', sequenceNumber: 10, description: 'Isolate and lockout motor', craftId: 'CFT-003', plannedHours: 0.5, numberOfTechnicians: 1, actualHours: 0.5, status: 'Completed' },
  { operationId: 'OP-014', workOrderId: 'WO-005', sequenceNumber: 20, description: 'Megger test windings', craftId: 'CFT-004', plannedHours: 1.0, numberOfTechnicians: 1, actualHours: 1.0, status: 'Completed' },
  { operationId: 'OP-015', workOrderId: 'WO-005', sequenceNumber: 30, description: 'Inspect terminal connections', craftId: 'CFT-003', plannedHours: 0.5, numberOfTechnicians: 1, actualHours: 0.5, status: 'Completed' },
  { operationId: 'OP-016', workOrderId: 'WO-005', sequenceNumber: 40, description: 'Replace damaged bearings', craftId: 'CFT-006', plannedHours: 4.0, numberOfTechnicians: 2, actualHours: 3.0, status: 'In Progress' },
  { operationId: 'OP-017', workOrderId: 'WO-005', sequenceNumber: 50, description: 'Reassemble and test run', craftId: 'CFT-006', plannedHours: 2.0, numberOfTechnicians: 1, actualHours: 0, status: 'Pending' },
  { operationId: 'OP-018', workOrderId: 'WO-006', sequenceNumber: 10, description: 'Isolate fan motor', craftId: 'CFT-003', plannedHours: 0.25, numberOfTechnicians: 1, actualHours: 0.25, status: 'Completed' },
  { operationId: 'OP-019', workOrderId: 'WO-006', sequenceNumber: 20, description: 'Remove old V-belt', craftId: 'CFT-002', plannedHours: 0.5, numberOfTechnicians: 1, actualHours: 0.5, status: 'Completed' },
  { operationId: 'OP-020', workOrderId: 'WO-006', sequenceNumber: 30, description: 'Install new V-belt and tension', craftId: 'CFT-002', plannedHours: 1.0, numberOfTechnicians: 1, actualHours: 0.5, status: 'In Progress' },
];

// ─── Work Order Materials ───
export const mockWorkOrderMaterials: WorkOrderMaterial[] = [
  { woMaterialId: 'WOM-001', workOrderId: 'WO-001', materialId: 'MAT-002', plannedQuantity: 0, actualQuantity: 0, unitCost: 120, reservationQuantity: 0 },
  { woMaterialId: 'WOM-002', workOrderId: 'WO-001', materialId: 'MAT-004', plannedQuantity: 1, actualQuantity: 0, unitCost: 850, reservationQuantity: 1 },
  { woMaterialId: 'WOM-003', workOrderId: 'WO-002', materialId: 'MAT-001', plannedQuantity: 2, actualQuantity: 0, unitCost: 450, reservationQuantity: 2 },
  { woMaterialId: 'WOM-004', workOrderId: 'WO-002', materialId: 'MAT-004', plannedQuantity: 1, actualQuantity: 0, unitCost: 850, reservationQuantity: 1 },
  { woMaterialId: 'WOM-005', workOrderId: 'WO-003', materialId: 'MAT-005', plannedQuantity: 4, actualQuantity: 0, unitCost: 35, reservationQuantity: 4 },
  { woMaterialId: 'WOM-006', workOrderId: 'WO-003', materialId: 'MAT-006', plannedQuantity: 2, actualQuantity: 0, unitCost: 28, reservationQuantity: 2 },
  { woMaterialId: 'WOM-007', workOrderId: 'WO-005', materialId: 'MAT-002', plannedQuantity: 2, actualQuantity: 2, unitCost: 120, reservationQuantity: 2 },
  { woMaterialId: 'WOM-008', workOrderId: 'WO-005', materialId: 'MAT-003', plannedQuantity: 2, actualQuantity: 2, unitCost: 180, reservationQuantity: 2 },
  { woMaterialId: 'WOM-009', workOrderId: 'WO-006', materialId: 'MAT-010', plannedQuantity: 2, actualQuantity: 2, unitCost: 45, reservationQuantity: 2 },
  { woMaterialId: 'WOM-010', workOrderId: 'WO-008', materialId: 'MAT-001', plannedQuantity: 1, actualQuantity: 0, unitCost: 450, reservationQuantity: 1 },
  { woMaterialId: 'WOM-011', workOrderId: 'WO-008', materialId: 'MAT-005', plannedQuantity: 2, actualQuantity: 0, unitCost: 35, reservationQuantity: 2 },
];

// ─── Labor Entries ───
export const mockLaborEntries: LaborEntry[] = [
  { laborEntryId: 'LE-001', operationId: 'OP-001', userId: 'USR-004', hoursWorked: 0.5, entryDateTime: '2026-07-05T08:45:00Z', notes: 'Vibration normal - 2.1 mm/s RMS', createdBy: 'USR-004', createdDate: '2026-07-05T08:45:00Z', modifiedBy: 'USR-004', modifiedDate: '2026-07-05T08:45:00Z', isDeleted: false },
  { laborEntryId: 'LE-002', operationId: 'OP-002', userId: 'USR-004', hoursWorked: 0.5, entryDateTime: '2026-07-05T09:15:00Z', notes: 'Drive end: 68°C, Non-drive end: 62°C', createdBy: 'USR-004', createdDate: '2026-07-05T09:15:00Z', modifiedBy: 'USR-004', modifiedDate: '2026-07-05T09:15:00Z', isDeleted: false },
  { laborEntryId: 'LE-003', operationId: 'OP-003', userId: 'USR-004', hoursWorked: 0.25, entryDateTime: '2026-07-05T09:30:00Z', notes: 'No visible leakage', createdBy: 'USR-004', createdDate: '2026-07-05T09:30:00Z', modifiedBy: 'USR-004', modifiedDate: '2026-07-05T09:30:00Z', isDeleted: false },
  { laborEntryId: 'LE-004', operationId: 'OP-004', userId: 'USR-004', hoursWorked: 1.0, entryDateTime: '2026-07-05T11:00:00Z', notes: 'Regreased both bearings with Mobil Polyrex EM', createdBy: 'USR-004', createdDate: '2026-07-05T11:00:00Z', modifiedBy: 'USR-004', modifiedDate: '2026-07-05T11:00:00Z', isDeleted: false },
  { laborEntryId: 'LE-005', operationId: 'OP-013', userId: 'USR-005', hoursWorked: 0.5, entryDateTime: '2026-07-03T09:00:00Z', notes: 'LOTO completed, motor isolated', createdBy: 'USR-005', createdDate: '2026-07-03T09:00:00Z', modifiedBy: 'USR-005', modifiedDate: '2026-07-03T09:00:00Z', isDeleted: false },
  { laborEntryId: 'LE-006', operationId: 'OP-014', userId: 'USR-005', hoursWorked: 1.0, entryDateTime: '2026-07-03T10:15:00Z', notes: 'U-V: 500 Mohm, V-W: 480 Mohm, W-U: 510 Mohm', createdBy: 'USR-005', createdDate: '2026-07-03T10:15:00Z', modifiedBy: 'USR-005', modifiedDate: '2026-07-03T10:15:00Z', isDeleted: false },
  { laborEntryId: 'LE-007', operationId: 'OP-016', userId: 'USR-004', hoursWorked: 3.0, entryDateTime: '2026-07-05T14:00:00Z', notes: 'Both bearings removed, races inspected - minor scoring on drive end', createdBy: 'USR-004', createdDate: '2026-07-05T14:00:00Z', modifiedBy: 'USR-004', modifiedDate: '2026-07-05T14:00:00Z', isDeleted: false },
  { laborEntryId: 'LE-008', operationId: 'OP-020', userId: 'USR-004', hoursWorked: 0.5, entryDateTime: '2026-07-05T09:00:00Z', notes: 'Belt tensioned per spec - deflection 15mm at 100N', createdBy: 'USR-004', createdDate: '2026-07-05T09:00:00Z', modifiedBy: 'USR-004', modifiedDate: '2026-07-05T09:00:00Z', isDeleted: false },
];

// ─── External Service Costs ───
export const mockExternalServices: ExternalServiceCost[] = [
  { serviceCostId: 'ESC-001', workOrderId: 'WO-003', vendor: 'TubeTech Services', description: 'Tube cleaning and inspection', cost: 8500, invoiceRef: 'INV-TTS-2026-112' },
  { serviceCostId: 'ESC-002', workOrderId: 'WO-003', vendor: 'NDT Solutions LLC', description: 'Eddy current testing of tubes', cost: 4200, invoiceRef: 'INV-NDT-2026-089' },
  { serviceCostId: 'ESC-003', workOrderId: 'WO-009', vendor: 'Boiler Inspection Corp', description: 'Statutory boiler inspection', cost: 12000, invoiceRef: 'INV-BIC-2026-034' },
  { serviceCostId: 'ESC-004', workOrderId: 'WO-020', vendor: 'Pressure Vessel Inspection', description: 'Internal inspection and NDT', cost: 15000, invoiceRef: 'INV-PVI-2026-056' },
];

// ─── Safety Checklists ───
export const mockChecklistTemplates: SafetyChecklistTemplate[] = [
  { checklistTemplateId: 'CLT-001', name: 'Lockout-Tagout (LOTO)', description: 'Standard lockout-tagout procedure for equipment isolation', isMandatory: true, createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { checklistTemplateId: 'CLT-002', name: 'Confined Space Entry', description: 'Safety checklist for confined space work', isMandatory: true, createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { checklistTemplateId: 'CLT-003', name: 'Hot Work Permit', description: 'Permit for welding, cutting, or grinding operations', isMandatory: true, createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { checklistTemplateId: 'CLT-004', name: 'Working at Height', description: 'Checklist for elevated work platforms and scaffolding', isMandatory: false, createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
];

export const mockChecklistItems: ChecklistItem[] = [
  { itemId: 'CLI-001', checklistTemplateId: 'CLT-001', sequenceNumber: 10, description: 'Energy source identified and isolated' },
  { itemId: 'CLI-002', checklistTemplateId: 'CLT-001', sequenceNumber: 20, description: 'Lock applied and tag attached' },
  { itemId: 'CLI-003', checklistTemplateId: 'CLT-001', sequenceNumber: 30, description: 'Stored energy dissipated or restrained' },
  { itemId: 'CLI-004', checklistTemplateId: 'CLT-001', sequenceNumber: 40, description: 'Verification of isolation performed' },
  { itemId: 'CLI-005', checklistTemplateId: 'CLT-002', sequenceNumber: 10, description: 'Atmosphere tested and safe' },
  { itemId: 'CLI-006', checklistTemplateId: 'CLT-002', sequenceNumber: 20, description: 'Ventilation confirmed adequate' },
  { itemId: 'CLI-007', checklistTemplateId: 'CLT-002', sequenceNumber: 30, description: 'Rescue equipment in place' },
  { itemId: 'CLI-008', checklistTemplateId: 'CLT-002', sequenceNumber: 40, description: 'Attendant assigned and communication established' },
  { itemId: 'CLI-009', checklistTemplateId: 'CLT-003', sequenceNumber: 10, description: 'Fire extinguisher available' },
  { itemId: 'CLI-010', checklistTemplateId: 'CLT-003', sequenceNumber: 20, description: 'Area cleared of combustibles' },
  { itemId: 'CLI-011', checklistTemplateId: 'CLT-003', sequenceNumber: 30, description: 'Fire watch assigned' },
  { itemId: 'CLI-012', checklistTemplateId: 'CLT-004', sequenceNumber: 10, description: 'Harness inspected and donned' },
  { itemId: 'CLI-013', checklistTemplateId: 'CLT-004', sequenceNumber: 20, description: 'Anchor point verified' },
  { itemId: 'CLI-014', checklistTemplateId: 'CLT-004', sequenceNumber: 30, description: 'Lanyard connected' },
];

export const mockWorkOrderChecklists: WorkOrderChecklist[] = [
  { woChecklistId: 'WCL-001', workOrderId: 'WO-001', checklistTemplateId: 'CLT-001', status: 'Completed', signedBy: 'USR-004', signedDate: '2026-07-05T08:20:00Z' },
  { woChecklistId: 'WCL-002', workOrderId: 'WO-002', checklistTemplateId: 'CLT-001', status: 'Pending', signedBy: null, signedDate: null },
  { woChecklistId: 'WCL-003', workOrderId: 'WO-005', checklistTemplateId: 'CLT-001', status: 'Completed', signedBy: 'USR-005', signedDate: '2026-07-03T08:35:00Z' },
  { woChecklistId: 'WCL-004', workOrderId: 'WO-006', checklistTemplateId: 'CLT-001', status: 'Completed', signedBy: 'USR-004', signedDate: '2026-07-05T07:35:00Z' },
];

// ─── Maintenance Plans (§3.4) ───
export const mockMaintenancePlans: MaintenancePlan[] = [
  { planId: 'MP-001', planCode: 'MP-P-101A-Q', description: 'Quarterly PM - Reactor Feed Pump 101A', equipmentId: 'EQ-001', functionalLocationId: null, workCenterId: 'WC-004', taskListId: 'TL-001', strategyType: 'Time', intervalValue: 3, intervalUnit: 'Months', callHorizonValue: 7, callHorizonUnit: 'Days', startDate: '2024-01-15', endDate: null, activeFlag: true, createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { planId: 'MP-002', planCode: 'MP-M-101-M', description: 'Monthly PM - Reactor 101 Agitator Motor', equipmentId: 'EQ-003', functionalLocationId: null, workCenterId: 'WC-004', taskListId: 'TL-002', strategyType: 'Time', intervalValue: 1, intervalUnit: 'Months', callHorizonValue: 5, callHorizonUnit: 'Days', startDate: '2024-01-01', endDate: null, activeFlag: true, createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { planId: 'MP-003', planCode: 'MP-HX-201-A', description: 'Annual PM - Distillation Reboiler 201', equipmentId: 'EQ-006', functionalLocationId: null, workCenterId: 'WC-001', taskListId: 'TL-003', strategyType: 'Time', intervalValue: 12, intervalUnit: 'Months', callHorizonValue: 30, callHorizonUnit: 'Days', startDate: '2024-08-10', endDate: null, activeFlag: true, createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { planId: 'MP-004', planCode: 'MP-B-301A-A', description: 'Annual Inspection - Boiler 301A', equipmentId: 'EQ-008', functionalLocationId: null, workCenterId: 'WC-001', taskListId: 'TL-003', strategyType: 'Time', intervalValue: 12, intervalUnit: 'Months', callHorizonValue: 60, callHorizonUnit: 'Days', startDate: '2024-04-10', endDate: null, activeFlag: true, createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { planId: 'MP-005', planCode: 'MP-P-101A-RH', description: 'Running Hours Based - Pump 101A Overhaul', equipmentId: 'EQ-001', functionalLocationId: null, workCenterId: 'WC-004', taskListId: 'TL-005', strategyType: 'Meter', intervalValue: 8760, intervalUnit: 'Months', callHorizonValue: 720, callHorizonUnit: 'Units', startDate: '2024-01-01', endDate: null, activeFlag: true, createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { planId: 'MP-006', planCode: 'MP-FE-101-C', description: 'Calibration - Flow Meter 101', equipmentId: 'EQ-011', functionalLocationId: null, workCenterId: 'WC-003', taskListId: 'TL-004', strategyType: 'Time', intervalValue: 6, intervalUnit: 'Months', callHorizonValue: 14, callHorizonUnit: 'Days', startDate: '2024-01-10', endDate: null, activeFlag: true, createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { planId: 'MP-007', planCode: 'MP-CT-302A-M', description: 'Monthly PM - Cooling Tower Fan 302A', equipmentId: 'EQ-010', functionalLocationId: null, workCenterId: 'WC-001', taskListId: 'TL-002', strategyType: 'Time', intervalValue: 1, intervalUnit: 'Months', callHorizonValue: 5, callHorizonUnit: 'Days', startDate: '2024-01-01', endDate: null, activeFlag: true, createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
  { planId: 'MP-008', planCode: 'MP-TE-201-C', description: 'Calibration - Temperature Element 201', equipmentId: 'EQ-015', functionalLocationId: null, workCenterId: 'WC-003', taskListId: 'TL-004', strategyType: 'Time', intervalValue: 12, intervalUnit: 'Months', callHorizonValue: 30, callHorizonUnit: 'Days', startDate: '2024-03-01', endDate: null, activeFlag: true, createdBy: 'admin', createdDate: '2024-01-01T00:00:00Z', modifiedBy: 'admin', modifiedDate: '2024-01-01T00:00:00Z', isDeleted: false },
];

// ─── Audit Log (§3.6) ───
export const mockAuditLog: AuditLogEntry[] = [
  { auditId: 'AUD-001', tableName: 'WorkOrder', recordId: 'WO-001', action: 'Update', fieldName: 'status', oldValue: 'Planned', newValue: 'In Progress', userId: 'USR-003', ipAddress: '192.168.1.50', timestamp: '2026-07-05T08:15:00Z' },
  { auditId: 'AUD-002', tableName: 'WorkOrder', recordId: 'WO-005', action: 'Create', fieldName: null, oldValue: null, newValue: 'WO created from NOT-002', userId: 'USR-002', ipAddress: '192.168.1.51', timestamp: '2026-07-03T09:00:00Z' },
  { auditId: 'AUD-003', tableName: 'WorkOrder', recordId: 'WO-005', action: 'Update', fieldName: 'status', oldValue: 'Draft', newValue: 'In Progress', userId: 'USR-003', ipAddress: '192.168.1.50', timestamp: '2026-07-03T08:30:00Z' },
  { auditId: 'AUD-004', tableName: 'Notification', recordId: 'NOT-002', action: 'Update', fieldName: 'status', oldValue: 'Open', newValue: 'Converted', userId: 'USR-002', ipAddress: '192.168.1.51', timestamp: '2026-07-03T09:00:00Z' },
  { auditId: 'AUD-005', tableName: 'Equipment', recordId: 'EQ-001', action: 'Update', fieldName: 'operationalStatus', oldValue: 'Active', newValue: 'Active', userId: 'USR-004', ipAddress: '192.168.1.52', timestamp: '2026-07-05T09:00:00Z' },
  { auditId: 'AUD-006', tableName: 'WorkOrder', recordId: 'WO-001', action: 'Create', fieldName: null, oldValue: null, newValue: 'PM Work Order created', userId: 'USR-002', ipAddress: '192.168.1.51', timestamp: '2026-07-01T09:00:00Z' },
  { auditId: 'AUD-007', tableName: 'WorkOrder', recordId: 'WO-007', action: 'Update', fieldName: 'status', oldValue: 'Completed', newValue: 'Closed', userId: 'USR-003', ipAddress: '192.168.1.50', timestamp: '2026-06-29T14:00:00Z' },
  { auditId: 'AUD-008', tableName: 'WorkOrder', recordId: 'WO-020', action: 'Update', fieldName: 'status', oldValue: 'Completed', newValue: 'Closed', userId: 'USR-003', ipAddress: '192.168.1.50', timestamp: '2026-05-18T16:00:00Z' },
  { auditId: 'AUD-009', tableName: 'MeterReading', recordId: 'RD-001', action: 'Create', fieldName: null, oldValue: null, newValue: 'Reading: 45230', userId: 'USR-004', ipAddress: '192.168.1.52', timestamp: '2026-07-05T06:00:00Z' },
  { auditId: 'AUD-010', tableName: 'Notification', recordId: 'NOT-005', action: 'Create', fieldName: null, oldValue: null, newValue: 'Notification created by operator', userId: 'USR-006', ipAddress: '192.168.1.53', timestamp: '2026-07-05T09:30:00Z' },
  { auditId: 'AUD-011', tableName: 'WorkOrder', recordId: 'WO-014', action: 'Update', fieldName: 'status', oldValue: 'In Progress', newValue: 'Suspended', userId: 'USR-003', ipAddress: '192.168.1.50', timestamp: '2026-07-04T14:00:00Z' },
  { auditId: 'AUD-012', tableName: 'WorkOrder', recordId: 'WO-004', action: 'Update', fieldName: 'status', oldValue: 'Scheduled', newValue: 'In Progress', userId: 'USR-004', ipAddress: '192.168.1.52', timestamp: '2026-07-05T09:30:00Z' },
];

// ─── System Alerts (§3.8) ───
export const mockAlerts: SystemAlert[] = [
  { alertId: 'AL-001', alertType: 'WO_Assigned', userId: 'USR-004', title: 'Work Order Assigned', message: 'WO-2026-0001 has been assigned to you - Quarterly PM Pump 101A', isRead: false, createdDate: '2026-07-05T08:15:00Z', relatedEntityId: 'WO-001', relatedEntityType: 'WorkOrder' },
  { alertId: 'AL-002', alertType: 'WO_Overdue', userId: 'USR-003', title: 'Overdue Work Order', message: 'WO-2026-0014 is overdue - Control Valve 201 actuator repair', isRead: false, createdDate: '2026-07-04T16:00:00Z', relatedEntityId: 'WO-014', relatedEntityType: 'WorkOrder' },
  { alertId: 'AL-003', alertType: 'High_Priority_Notification', userId: 'USR-002', title: 'High Priority Notification', message: 'NOT-10000005: High pressure drop across Distillation Column 201', isRead: false, createdDate: '2026-07-05T09:30:00Z', relatedEntityId: 'NOT-005', relatedEntityType: 'Notification' },
  { alertId: 'AL-004', alertType: 'WO_Assigned', userId: 'USR-004', title: 'Work Order Assigned', message: 'WO-2026-0006 has been assigned to you - Cooling Tower Fan belt replacement', isRead: true, createdDate: '2026-07-05T07:30:00Z', relatedEntityId: 'WO-006', relatedEntityType: 'WorkOrder' },
  { alertId: 'AL-005', alertType: 'WO_Overdue', userId: 'USR-002', title: 'Work Order Overdue', message: 'WO-2026-0002 is scheduled for tomorrow - Gearbox oil leak repair', isRead: false, createdDate: '2026-07-05T18:00:00Z', relatedEntityId: 'WO-002', relatedEntityType: 'WorkOrder' },
  { alertId: 'AL-006', alertType: 'PM_Generation', userId: 'USR-002', title: 'PM Work Order Generated', message: 'WO-2026-0012 has been automatically generated from plan MP-TE-201-C', isRead: true, createdDate: '2026-07-05T06:00:00Z', relatedEntityId: 'WO-012', relatedEntityType: 'WorkOrder' },
  { alertId: 'AL-007', alertType: 'High_Priority_Notification', userId: 'USR-003', title: 'Breakdown Reported', message: 'NOT-10000002: Reactor 101 agitator motor tripped on overload', isRead: true, createdDate: '2026-07-03T08:15:00Z', relatedEntityId: 'NOT-002', relatedEntityType: 'Notification' },
  { alertId: 'AL-008', alertType: 'WO_Assigned', userId: 'USR-005', title: 'Work Order Assigned', message: 'WO-2026-0005 has been assigned to you - Emergency motor repair', isRead: true, createdDate: '2026-07-03T08:30:00Z', relatedEntityId: 'WO-005', relatedEntityType: 'WorkOrder' },
];

// ─── Comments ───
export const mockComments: Comment[] = [
  { commentId: 'COM-001', entityType: 'WorkOrder', entityId: 'WO-001', userId: 'USR-003', content: 'Ensure spare bearings are available before starting.', createdDate: '2026-07-01T09:15:00Z' },
  { commentId: 'COM-002', entityType: 'WorkOrder', entityId: 'WO-001', userId: 'USR-004', content: 'Bearing temps slightly elevated but within acceptable range. Will monitor during PM.', createdDate: '2026-07-05T09:45:00Z' },
  { commentId: 'COM-003', entityType: 'WorkOrder', entityId: 'WO-005', userId: 'USR-003', content: 'Priority 1 - reactor cannot operate without agitator. Expedite all material.', createdDate: '2026-07-03T08:35:00Z' },
  { commentId: 'COM-004', entityType: 'WorkOrder', entityId: 'WO-005', userId: 'USR-005', content: 'Motor isolated and meggar test complete. Windings in good condition. Proceeding with bearing replacement.', createdDate: '2026-07-03T11:00:00Z' },
  { commentId: 'COM-005', entityType: 'Notification', entityId: 'NOT-001', userId: 'USR-002', content: 'Schedule vibration analysis follow-up. Possible bearing degradation.', createdDate: '2026-07-04T15:00:00Z' },
];

// ─── Dashboard KPIs ───
export const mockDashboardKPIs: DashboardKPIs = {
  activeWorkOrders: 247,
  overdueWorkOrders: 12,
  scheduledToday: 8,
  completionRate: 94,
  openNotifications: 5,
  pmCompliance: 87,
};
