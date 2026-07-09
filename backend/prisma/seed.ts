import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';

const prisma = new PrismaClient();

async function main() {
  // Clear existing data
  await prisma.workOrderChecklistItem.deleteMany();
  await prisma.workOrderChecklist.deleteMany();
  await prisma.checklistItem.deleteMany();
  await prisma.safetyChecklistTemplate.deleteMany();
  await prisma.laborEntry.deleteMany();
  await prisma.workOrderMaterial.deleteMany();
  await prisma.workOrderOperation.deleteMany();
  await prisma.externalServiceCost.deleteMany();
  await prisma.costSplit.deleteMany();
  await prisma.workOrderNotifLink.deleteMany();
  await prisma.maintenancePlanMeter.deleteMany();
  await prisma.maintenancePlan.deleteMany();
  await prisma.taskListOperation.deleteMany();
  await prisma.taskList.deleteMany();
  await prisma.causeCode.deleteMany();
  await prisma.failureCode.deleteMany();
  await prisma.equipmentBOMMaterial.deleteMany();
  await prisma.meterReading.deleteMany();
  await prisma.equipmentMeter.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.systemAlert.deleteMany();
  await prisma.auditLogEntry.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.workOrder.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.craft.deleteMany();
  await prisma.workCenter.deleteMany();
  await prisma.material.deleteMany();
  await prisma.equipment.deleteMany();
  await prisma.functionalLocation.deleteMany();
  await prisma.user.deleteMany();
  await prisma.systemConfig.deleteMany();

  const hash = await bcrypt.hash('password', 10);

  // Users
  const users = await Promise.all([
    prisma.user.create({ data: { userId: uuid(), username: 'admin', passwordHash: hash, fullName: 'Admin User', email: 'admin@cmms.local', role: 'Administrator', isActive: true } }),
    prisma.user.create({ data: { userId: uuid(), username: 'planner', passwordHash: hash, fullName: 'Maintenance Planner', email: 'planner@cmms.local', role: 'Maintenance Planner', isActive: true } }),
    prisma.user.create({ data: { userId: uuid(), username: 'supervisor', passwordHash: hash, fullName: 'Maintenance Supervisor', email: 'supervisor@cmms.local', role: 'Maintenance Supervisor', isActive: true } }),
    prisma.user.create({ data: { userId: uuid(), username: 'tech1', passwordHash: hash, fullName: 'Technician One', email: 'tech1@cmms.local', role: 'Technician', isActive: true } }),
    prisma.user.create({ data: { userId: uuid(), username: 'tech2', passwordHash: hash, fullName: 'Technician Two', email: 'tech2@cmms.local', role: 'Technician', isActive: true } }),
    prisma.user.create({ data: { userId: uuid(), username: 'operator', passwordHash: hash, fullName: 'Plant Operator', email: 'operator@cmms.local', role: 'Requester', isActive: true } }),
    prisma.user.create({ data: { userId: uuid(), username: 'auditor', passwordHash: hash, fullName: 'External Auditor', email: 'auditor@cmms.local', role: 'View-Only', isActive: true } }),
  ]);

  // Functional Locations
  const plant = await prisma.functionalLocation.create({ data: { functionalLocationId: uuid(), locationCode: 'PL-01', description: 'Main Production Plant', locationType: 'Plant', operationalStatus: 'Active' } });
  const area1 = await prisma.functionalLocation.create({ data: { functionalLocationId: uuid(), locationCode: 'AR-001', description: 'Processing Area A', parentLocationId: plant.functionalLocationId, locationType: 'Area', operationalStatus: 'Active' } });
  const area2 = await prisma.functionalLocation.create({ data: { functionalLocationId: uuid(), locationCode: 'AR-002', description: 'Utilities Area B', parentLocationId: plant.functionalLocationId, locationType: 'Area', operationalStatus: 'Active' } });
  const unit1 = await prisma.functionalLocation.create({ data: { functionalLocationId: uuid(), locationCode: 'UN-001', description: 'Distillation Unit', parentLocationId: area1.functionalLocationId, locationType: 'Unit', operationalStatus: 'Active' } });
  const unit2 = await prisma.functionalLocation.create({ data: { functionalLocationId: uuid(), locationCode: 'UN-002', description: 'Reactor Unit', parentLocationId: area1.functionalLocationId, locationType: 'Unit', operationalStatus: 'Active' } });
  const sub1 = await prisma.functionalLocation.create({ data: { functionalLocationId: uuid(), locationCode: 'SU-001', description: 'Cooling System', parentLocationId: unit1.functionalLocationId, locationType: 'Sub-unit', operationalStatus: 'Active' } });

  // Work Centers
  const wc = await Promise.all([
    prisma.workCenter.create({ data: { workCenterId: uuid(), code: 'MECH', name: 'Mechanical Workshop', dailyCapacityHours: 8, costRatePerHour: 45 } }),
    prisma.workCenter.create({ data: { workCenterId: uuid(), code: 'ELEC', name: 'Electrical Team', dailyCapacityHours: 8, costRatePerHour: 50 } }),
    prisma.workCenter.create({ data: { workCenterId: uuid(), code: 'INST', name: 'Instrumentation Team', dailyCapacityHours: 8, costRatePerHour: 55 } }),
  ]);

  // Crafts
  await Promise.all([
    prisma.craft.create({ data: { craftId: uuid(), workCenterId: wc[0].workCenterId, craftCode: 'FITTER', description: 'Fitter', hourlyRate: 35 } }),
    prisma.craft.create({ data: { craftId: uuid(), workCenterId: wc[0].workCenterId, craftCode: 'WELDER', description: 'Welder', hourlyRate: 40 } }),
    prisma.craft.create({ data: { craftId: uuid(), workCenterId: wc[1].workCenterId, craftCode: 'ELEC_TECH', description: 'Electrician', hourlyRate: 45 } }),
    prisma.craft.create({ data: { craftId: uuid(), workCenterId: wc[2].workCenterId, craftCode: 'INST_TECH', description: 'Instrument Technician', hourlyRate: 50 } }),
  ]);

  // Equipment
  const equip1 = await prisma.equipment.create({ data: { equipmentId: uuid(), equipmentCode: 'P-1001', name: 'Centrifugal Pump A', description: 'Main feed pump', functionalLocationId: sub1.functionalLocationId, manufacturer: 'Grundfos', model: 'CR-45', serialNumber: 'GR-2024-001', assetTag: 'AST-001', equipmentClass: 'Pump', criticality: 'A', technicalParameters: { power: '45kW', flow: '100m3/h', speed: '2900rpm' } } });
  const equip2 = await prisma.equipment.create({ data: { equipmentId: uuid(), equipmentCode: 'M-1002', name: 'Induction Motor', description: 'Main drive motor', functionalLocationId: unit2.functionalLocationId, manufacturer: 'Siemens', model: '1LA8', serialNumber: 'SI-2024-002', assetTag: 'AST-002', equipmentClass: 'Motor', criticality: 'B', technicalParameters: { power: '75kW', voltage: '415V', current: '135A' } } });
  await prisma.equipment.create({ data: { equipmentId: uuid(), equipmentCode: 'V-1003', name: 'Pressure Vessel', description: 'Storage vessel', functionalLocationId: unit1.functionalLocationId, manufacturer: 'Larsen & Toubro', model: 'PV-200', serialNumber: 'LT-2024-003', assetTag: 'AST-003', equipmentClass: 'Vessel', criticality: 'A' } });
  await prisma.equipment.create({ data: { equipmentId: uuid(), equipmentCode: 'C-1004', name: 'Distillation Column', description: 'Main fractionator', functionalLocationId: unit1.functionalLocationId, manufacturer: 'Mitsubishi', model: 'DC-500', serialNumber: 'MI-2024-004', assetTag: 'AST-004', equipmentClass: 'Column', criticality: 'A' } });
  await prisma.equipment.create({ data: { equipmentId: uuid(), equipmentCode: 'B-1005', name: 'Package Boiler', description: 'Steam generation', functionalLocationId: area2.functionalLocationId, manufacturer: 'Thermax', model: 'TB-50', serialNumber: 'TH-2024-005', assetTag: 'AST-005', equipmentClass: 'Boiler', criticality: 'B' } });

  // Equipment Meters
  const meter1 = await prisma.equipmentMeter.create({ data: { meterId: uuid(), equipmentId: equip1.equipmentId, meterName: 'Running Hours', unitOfMeasure: 'Hours', lastReading: 4500, lastReadingDate: new Date('2026-07-01') } });
  await prisma.equipmentMeter.create({ data: { meterId: uuid(), equipmentId: equip1.equipmentId, meterName: 'Cycles', unitOfMeasure: 'Cycles', lastReading: 1200 } });
  await prisma.equipmentMeter.create({ data: { meterId: uuid(), equipmentId: equip2.equipmentId, meterName: 'Operating Hours', unitOfMeasure: 'Hours', lastReading: 3200 } });

  // Meter Readings
  await prisma.meterReading.create({ data: { readingId: uuid(), meterId: meter1.meterId, readingValue: 4400, readingDate: new Date('2026-06-01') } });
  await prisma.meterReading.create({ data: { readingId: uuid(), meterId: meter1.meterId, readingValue: 4450, readingDate: new Date('2026-06-15') } });
  await prisma.meterReading.create({ data: { readingId: uuid(), meterId: meter1.meterId, readingValue: 4500, readingDate: new Date('2026-07-01') } });

  // Materials
  await Promise.all([
    prisma.material.create({ data: { materialId: uuid(), materialCode: 'MECH-SEAL-001', description: 'Mechanical Seal 45mm', unitOfMeasure: 'EA', standardCost: 250, currentStock: 15 } }),
    prisma.material.create({ data: { materialId: uuid(), materialCode: 'BEARING-6205', description: 'Ball Bearing 6205ZZ', unitOfMeasure: 'EA', standardCost: 35, currentStock: 50 } }),
    prisma.material.create({ data: { materialId: uuid(), materialCode: 'LUBE-OIL-ISO68', description: 'Lubricating Oil ISO VG 68', unitOfMeasure: 'LTR', standardCost: 8, currentStock: 200 } }),
    prisma.material.create({ data: { materialId: uuid(), materialCode: 'GASKET-150', description: 'Gasket 150mm RF', unitOfMeasure: 'EA', standardCost: 12, currentStock: 100 } }),
    prisma.material.create({ data: { materialId: uuid(), materialCode: 'VALVE-GATE-2', description: 'Gate Valve 2" 150lb', unitOfMeasure: 'EA', standardCost: 180, currentStock: 8 } }),
  ]);

  // Failure Codes
  await Promise.all([
    prisma.failureCode.create({ data: { failureCodeId: uuid(), code: 'MECH', description: 'Mechanical Failure' } }),
    prisma.failureCode.create({ data: { failureCodeId: uuid(), code: 'MECH-VIB', description: 'Vibration', parentCodeId: (await prisma.failureCode.findFirst({ where: { code: 'MECH' } }))?.failureCodeId } }),
    prisma.failureCode.create({ data: { failureCodeId: uuid(), code: 'MECH-SEAL', description: 'Seal Failure', parentCodeId: (await prisma.failureCode.findFirst({ where: { code: 'MECH' } }))?.failureCodeId } }),
    prisma.failureCode.create({ data: { failureCodeId: uuid(), code: 'ELEC', description: 'Electrical Failure' } }),
    prisma.failureCode.create({ data: { failureCodeId: uuid(), code: 'ELEC-MOTOR', description: 'Motor Winding Failure', parentCodeId: (await prisma.failureCode.findFirst({ where: { code: 'ELEC' } }))?.failureCodeId } }),
  ]);

  // Cause Codes
  await Promise.all([
    prisma.causeCode.create({ data: { causeCodeId: uuid(), code: 'WEAR-TEAR', description: 'Normal Wear & Tear' } }),
    prisma.causeCode.create({ data: { causeCodeId: uuid(), code: 'OP-ERROR', description: 'Operator Error' } }),
    prisma.causeCode.create({ data: { causeCodeId: uuid(), code: 'DESIGN-DEFECT', description: 'Design Defect' } }),
    prisma.causeCode.create({ data: { causeCodeId: uuid(), code: 'CORROSION', description: 'Corrosion' } }),
    prisma.causeCode.create({ data: { causeCodeId: uuid(), code: 'LUBRICATION', description: 'Lubrication Failure' } }),
  ]);

  // Task Lists
  const tl1 = await prisma.taskList.create({ data: { taskListId: uuid(), code: 'PM-PUMP-001', description: 'Centrifugal Pump PM', equipmentId: equip1.equipmentId, workCenterId: wc[0].workCenterId } });
  const tl2 = await prisma.taskList.create({ data: { taskListId: uuid(), code: 'PM-MOTOR-001', description: 'Induction Motor PM', equipmentId: equip2.equipmentId, workCenterId: wc[1].workCenterId } });

  // Task List Operations
  const fitterCraft = await prisma.craft.findFirst({ where: { craftCode: 'FITTER' } });
  const elecCraft = await prisma.craft.findFirst({ where: { craftCode: 'ELEC_TECH' } });
  if (fitterCraft) {
    await prisma.taskListOperation.create({ data: { taskOperationId: uuid(), taskListId: tl1.taskListId, sequenceNumber: 10, description: 'Check coupling alignment', craftId: fitterCraft.craftId, plannedHours: 1, numberOfTechnicians: 1 } });
    await prisma.taskListOperation.create({ data: { taskOperationId: uuid(), taskListId: tl1.taskListId, sequenceNumber: 20, description: 'Replace mechanical seal', craftId: fitterCraft.craftId, plannedHours: 2, numberOfTechnicians: 1 } });
    await prisma.taskListOperation.create({ data: { taskOperationId: uuid(), taskListId: tl1.taskListId, sequenceNumber: 30, description: 'Lubricate bearings', craftId: fitterCraft.craftId, plannedHours: 0.5, numberOfTechnicians: 1 } });
  }
  if (elecCraft) {
    await prisma.taskListOperation.create({ data: { taskOperationId: uuid(), taskListId: tl2.taskListId, sequenceNumber: 10, description: 'Check winding resistance', craftId: elecCraft.craftId, plannedHours: 1.5, numberOfTechnicians: 1 } });
    await prisma.taskListOperation.create({ data: { taskOperationId: uuid(), taskListId: tl2.taskListId, sequenceNumber: 20, description: 'Check bearing condition', craftId: elecCraft.craftId, plannedHours: 0.5, numberOfTechnicians: 1 } });
  }

  // Safety Checklist Templates
  const clTemplate = await prisma.safetyChecklistTemplate.create({ data: { checklistTemplateId: uuid(), name: 'Lockout/Tagout', description: 'Standard LOTO procedure', isMandatory: true } });
  await prisma.checklistItem.create({ data: { itemId: uuid(), checklistTemplateId: clTemplate.checklistTemplateId, sequenceNumber: 10, description: 'Identify all energy sources' } });
  await prisma.checklistItem.create({ data: { itemId: uuid(), checklistTemplateId: clTemplate.checklistTemplateId, sequenceNumber: 20, description: 'Isolate energy sources' } });
  await prisma.checklistItem.create({ data: { itemId: uuid(), checklistTemplateId: clTemplate.checklistTemplateId, sequenceNumber: 30, description: 'Apply lock and tag' } });

  // System Config
  await prisma.systemConfig.create({ data: { configId: uuid(), key: 'wo_number_prefix', value: 'WO' } });
  await prisma.systemConfig.create({ data: { configId: uuid(), key: 'notif_number_prefix', value: 'N' } });
  await prisma.systemConfig.create({ data: { configId: uuid(), key: 'session_timeout_minutes', value: '30' } });
  await prisma.systemConfig.create({ data: { configId: uuid(), key: 'pm_scheduler_interval', value: 'daily' } });
  await prisma.systemConfig.create({ data: { configId: uuid(), key: 'audit_retention_years', value: '7' } });

  console.log('Seed completed successfully');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
