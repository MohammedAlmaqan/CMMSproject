# UAT v1.7.1 - S0-S6 acceptance pass

Generated: 2026-11-17T08:13:14.410075+00:00
UI: http://localhost:3000 (built `app/dist` behind the throwaway proxy)
API: http://localhost:4100 against the throwaway `cmms_uat` clone

Result: **81 passed, 0 failed**

| Section | Check | Result | Detail |
|---|---|---|---|
| s0 | S0 API health is 200 and ok | PASS | status=200 body={'status': 'ok', 'timestamp': '2026-11-17T08:12:07.082Z'} |
| s0 | S0 the API session is the Administrator | PASS | status=200 user=admin role=Administrator |
| s0 | S0 the app loads the dashboard | PASS | title=CommandPulse CMMS |
| s0 | S0 the dashboard renders without an error marker | PASS | markers=[] |
| s0 | S0 the served bundle is the build under test | PASS | served=/assets/index-Bq2YWIrw.js expected=index-Bq2YWIrw.js |
| s0 | S0 no console error on load | PASS | console=[] |
| s1 | S1 functional location created through the form | PASS | UAT171-LOC-111203 |
| s1 | S1 the location persisted | PASS | status=200 rows=1 |
| s1 | S1 equipment created through the form | PASS | UAT171-EQ-111203 |
| s1 | S1 the equipment is linked to the new location | PASS | equipmentLocation=6717ed1d-068e-4944-88fa-dfa530f7412d expected=6717ed1d-068e-4944-88fa-dfa530f7412d |
| s1 | S1 the equipment sits on a lowest-level location | PASS | locationsAtOrBelow=1 |
| s1 | S1 work centre created through the form | PASS | UAT171-WC-111203 |
| s1 | S1 the work centre persisted | PASS | status=200 |
| s2 | S2 M1 notification raised through the form | PASS | N-000503 |
| s2 | S2 notification carries the M1 type and the new equipment | PASS | type=M1 equipment=db824c02-bf5b-4c6a-b983-48010b69a590 |
| s2 | S2 notification converted to a work order | PASS | http://localhost:3000/work-orders/b3d5a278-6f0c-472a-9006-a03ef0334edd |
| s2 | S2 operation added to the work order | PASS |  |
| s2 | S2 workflow Plan -> Planned | PASS |  |
| s2 | S2 workflow Schedule -> Scheduled | PASS |  |
| s2 | S2 workflow Start -> In Progress | PASS |  |
| s2 | S2 workflow Complete -> Completed | PASS |  |
| s2 | S2 workflow Close -> Closed | PASS |  |
| s2 | S2 completing the work order generated no M3 (D-22) | PASS | m3 before=4 after=4 |
| s2 | S2 the converted notification reached Completed | PASS | status=Completed |
| s2 | S2 the closed work order carries both actual timestamps | PASS | actualStart=True actualFinish=True |
| s3 | S3a a draft work order was created | PASS | status=201 |
| s3 | S3a the UI refuses to plan a work order with no operations | PASS | alert=0 |
| s3 | S3a the API refuses Draft -> Planned with 409 | PASS | status=409 body={'error': 'A work order must contain at least one operation before it can be planned'} |
| s3 | S3b an operation was added to the guard work order | PASS | status=201 |
| s3 | S3b the work order reaches Planned | PASS |  |
| s3 | S3b the UI keeps the dialog open and does not schedule without dates | PASS | dialogOpen=True status=Planned |
| s3 | S3b the API refuses Scheduled without dates with 400 | PASS | status=400 body={'error': 'Scheduling a work order requires plannedStart and plannedFinish'} |
| s3 | S3c an M3 completion confirmation was created | PASS | status=201 |
| s3 | S3c the UI hides Convert to WO on a completion confirmation | PASS |  |
| s3 | S3c the UI explains why the record is read-only | PASS |  |
| s3 | S3c the API refuses to convert a completion confirmation with 400 | PASS | status=400 body={'error': 'Notification N-000504 is a completion confirmation and cannot be converted to a work order'} |
| s4 | S4 breakdown A started | PASS | id=cba85ceb-e0b9-4d0b-b14d-3ed9f7202285 state=In Progress  |
| s4 | S4 breakdown B started | PASS | id=1895ee34-b4d6-4e8f-8a92-afb274d885e3 state=In Progress  |
| s4 | S4 breakdown B completed and closed | PASS |  |
| s4 | S4 breakdown A completed and closed (overlapping B) | PASS |  |
| s4 | S4 breakdown C left open for the exclusion count | PASS | id=eef5d0f6-a6f0-4a0f-a134-48b05a3c2725  |
| s4 | S4 raw breakdown rows fetched | PASS | status=200 rows=10 |
| s4 | S4 raw corrective rows fetched | PASS | status=200 rows=223 |
| s4 | S4 MTBF returns an object with byEquipment | PASS | status=200 keys=['byEquipment', 'excludedIncomplete'] |
| s4 | S4 MTBF labels the row with the equipment code and name | PASS | code=UAT171-EQ-111203 name=UAT 1.7.1 pump 111203 expectedName=UAT 1.7.1 pump 111203 |
| s4 | S4 MTBF reports two failures for the new asset | PASS | breakdownCount=2 |
| s4 | S4 MTBF clamps overlapping repairs at zero | PASS | mtbfHours=0 recomputed={'mtbfHours': 0.0, 'breakdownCount': 2} |
| s4 | S4 MTBF counts the open breakdown as excluded | PASS | excludedIncomplete=1 recomputed=1 |
| s4 | S4 the clamp was actually needed (unclamped uptime is negative) | PASS | spanHours=0.0001 repairHours=0.0003 unclamped=-0.0001 |
| s4 | S4 MTBF reports a null interval for a single failure | PASS | singleFailureRows=[('0-A-2502', None), ('0-A-2502-M01C', None)] |
| s4 | S4 MTBF orders rows by equipment code | PASS | rows=4 |
| s4 | S4 MTBF never uses a UUID as a label | PASS | uuidLabels=[] rows=4 |
| s4 | S4 MTBF matches the independently recomputed arithmetic | PASS | problems=[] excluded=2 recomputed=2 |
| s4 | S4 MTTR returns byEquipment and byLocation | PASS | status=200 keys=['byEquipment', 'byLocation', 'excludedIncomplete'] |
| s4 | S4 MTTR by equipment matches the recomputed arithmetic | PASS | problems=[] rows=4 |
| s4 | S4 MTTR by location matches the recomputed arithmetic | PASS | problems=[] rows=4 |
| s4 | S4 MTTR counts the open breakdown as excluded | PASS | excludedIncomplete=4 recomputed=4 |
| s4 | S4 MTTR reports a positive repair interval | PASS | values=[0.08, 0.03, 0, 0] |
| s4 | S4 MTTR never uses a UUID as a label | PASS | uuidLabels=[] |
| s4 | S4 MTTR by location carries a location code | PASS | emptyLabels=[] |
| s4 | S4 downtime returns a list of equipment rows | PASS | status=200 |
| s4 | S4 downtime matches the recomputed arithmetic | PASS | problems=[] rows=6 |
| s4 | S4 downtime never uses a UUID as a label | PASS | uuidLabels=[] rows=6 |
| s4 | S4 the MTBF axis carries the equipment code | PASS | axis=['UAT171-EQ-111203', '0', '1', '2', '3', '4'] |
| s4 | S4 the MTBF screen shows no UUID | PASS | uuids=[] |
| s4 | S4 the MTBF screen states how many breakdowns were excluded | PASS | snippet=['1 breakdown excluded: still open, with no completion time to measure.'] |
| s4 | S4 the MTTR screen shows no UUID | PASS | uuids=[] |
| s4 | S4 the Downtime screen shows no UUID | PASS | uuids=[] |
| s4 | S4 MTBF export returns an xlsx | PASS | status=200 bytes=3555 |
| s4 | S4 the MTBF workbook carries a Summary and a By Equipment sheet | PASS | sheets=['Summary', 'By Equipment'] |
| s4 | S4 the export carries equipmentCode and equipmentName columns | PASS | header=['equipmentId', 'equipmentCode', 'equipmentName', 'mtbfHours', 'breakdownCount'] |
| s4 | S4 the export's label cells are the plant's code, not a UUID | PASS | codes=['UAT171-EQ-111203'] names=['UAT 1.7.1 pump 111203'] |
| s4 | S4 the mttr export carries plant labels and no UUID label | PASS | status=200 labelCells=16 uuidLabels=[] |
| s4 | S4 the downtime export carries plant labels and no UUID label | PASS | status=200 labelCells=12 uuidLabels=[] |
| s4 | S4 the Export button downloads a workbook | PASS | file=export_mtbf_ui.xlsx bytes=3555 |
| s5 | S5 a Requester account was created | PASS | status=201 |
| s5 | S5 the Requester signs in | PASS | user=uat171-requester-111203 |
| s5 | S5 the Requester has no Administration navigation entry | PASS | navItems=13 |
| s5 | S5 a direct visit to /administration lands on the dashboard | PASS | url=http://localhost:3000/dashboard |
| s5 | S5 the Requester is refused /api/users with 403 | PASS | status=403 body={'error': 'Forbidden'} |
| s5 | S5 the Requester is refused /api/audit-log with 403 | PASS | status=403 body={'error': 'Insufficient permissions'} |

Console errors captured: 0; failed HTTP responses: 0