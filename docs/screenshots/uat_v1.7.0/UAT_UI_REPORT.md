# UAT v1.7.0 - browser walkthrough

Generated: 2026-11-13T09:58:29.779202+00:00
Target: http://localhost:3000

Result: **62 passed, 0 failed**

| Section | Check | Result | Detail |
|---|---|---|---|
| nav | nav Dashboard: renders without error | PASS | url=dashboard markers=[] console=[] |
| nav | nav Work Orders: renders without error | PASS | url=work-orders markers=[] console=[] |
| nav | nav Preventive Maintenance: renders without error | PASS | url=preventive-maintenance markers=[] console=[] |
| nav | nav Notifications: renders without error | PASS | url=notifications markers=[] console=[] |
| nav | nav Locations: renders without error | PASS | url=locations markers=[] console=[] |
| nav | nav Equipment: renders without error | PASS | url=equipment markers=[] console=[] |
| nav | nav Work Centers: renders without error | PASS | url=work-centers markers=[] console=[] |
| nav | nav Crafts: renders without error | PASS | url=crafts markers=[] console=[] |
| nav | nav Task Lists: renders without error | PASS | url=task-lists markers=[] console=[] |
| nav | nav Materials: renders without error | PASS | url=materials markers=[] console=[] |
| nav | nav Code Lists: renders without error | PASS | url=code-lists markers=[] console=[] |
| nav | nav Safety Checklists: renders without error | PASS | url=safety-checklists markers=[] console=[] |
| nav | nav Reports: renders without error | PASS | url=reports markers=[] console=[] |
| nav | nav Administration: renders without error | PASS | url=administration markers=[] console=[] |
| roles | login Administrator | PASS | user=uat170-admin navItems=14 adminVisible=True |
| roles | Administrator: Administration visibility matches policy | PASS | adminVisible=True expected=True |
| roles | login Maintenance Planner | PASS | user=uat170-planner navItems=13 adminVisible=False |
| roles | Maintenance Planner: Administration visibility matches policy | PASS | adminVisible=False expected=False |
| roles | login Maintenance Supervisor | PASS | user=uat170-supervisor navItems=13 adminVisible=False |
| roles | Maintenance Supervisor: Administration visibility matches policy | PASS | adminVisible=False expected=False |
| roles | login Technician | PASS | user=uat170-tech navItems=13 adminVisible=False |
| roles | Technician: Administration visibility matches policy | PASS | adminVisible=False expected=False |
| roles | login Requester | PASS | user=uat170-requester navItems=13 adminVisible=False |
| roles | Requester: Administration visibility matches policy | PASS | adminVisible=False expected=False |
| roles | login View-Only | PASS | user=uat170-viewonly navItems=13 adminVisible=False |
| roles | View-Only: Administration visibility matches policy | PASS | adminVisible=False expected=False |
| masterdata | create work center: form accepted | PASS | UAT170-WC-125619 |
| masterdata | create material: form accepted | PASS | UAT170-MAT-125619 |
| masterdata | a lowest-level functional location exists | PASS | status=200 locations=463 leaves=362 |
| masterdata | create equipment: form accepted | PASS | UAT170-EQ-125619 |
| masterdata | master data persisted (API) | PASS | wc=200 mat=200 eq=200 |
| csv | materials CSV export | PASS | rows=5697 header=materialCode,description,unitOfMeasure,standardCost,currentStock |
| csv | materials CSV import | PASS | Imported 1 new, 0 updated |
| csv | locations CSV export | PASS | rows=463 |
| csv | locations CSV import | PASS | Imported 0 new, 463 updated |
| lifecycle | notification raised via UI | PASS | N-000505 |
| lifecycle | notification detail shows M2 | PASS | N-000505 |
| lifecycle | converted to work order | PASS | http://localhost:3000/work-orders/7bdc6762-3b44-4876-ad6a-f2a24c949d82 |
| lifecycle | work order assigned to supervisor | PASS |  |
| lifecycle | operation added | PASS |  |
| lifecycle | workflow Plan -> Planned | PASS |  |
| lifecycle | workflow Schedule -> Scheduled | PASS |  |
| lifecycle | workflow Start -> In Progress | PASS |  |
| lifecycle | workflow Complete -> Completed | PASS |  |
| lifecycle | workflow Close -> Closed | PASS |  |
| lifecycle | D-22: completing the WO generated no M3 | PASS | m3 before=3 after=3 |
| lifecycle | converted notification reached Completed | PASS | status=Completed |
| lifecycle | closed WO carries actual timestamps | PASS | actualStart=True actualFinish=True |
| reports | report tab WO Backlog renders | PASS | markers=[] console=[] |
| reports | report tab PM Compliance renders | PASS | markers=[] console=[] |
| reports | report tab MTBF renders | PASS | markers=[] console=[] |
| reports | report tab MTTR renders | PASS | markers=[] console=[] |
| reports | report tab Cost Summary renders | PASS | markers=[] console=[] |
| reports | report tab Downtime renders | PASS | markers=[] console=[] |
| reports | report tab Material Usage renders | PASS | markers=[] console=[] |
| legacy | live M3 list holds only the three Converted rows | PASS | rows=['N-000479', 'N-000481', 'N-000485'] |
| legacy | live M3 list hides all eight soft-deleted Open rows | PASS | visible=['N-000479', 'N-000481', 'N-000485'] |
| legacy | live API returns zero Open M3 | PASS | open=0 |
| legacy | legacy M3 shows the Legacy record badge | PASS | N-000485 |
| legacy | legacy M3 hides Convert to WO | PASS |  |
| legacy | legacy M3 hides Delete | PASS |  |
| legacy | legacy M3 shows the read-only note | PASS |  |

Console errors captured: 0; failed HTTP responses: 0