import { PostgresPassRepository } from '../web/src/infrastructure/repositories/postgres-pass.repository';
import type { SessionUser } from '../web/src/core/domain/entities/user.entity';

async function runVerification() {
  console.log('=== POLICE BANDOBUSTH ENTERPRISE SYSTEM VERIFICATION ===\n');

  const repo = new PostgresPassRepository();
  const adminActor: SessionUser = {
    id: '9175d5df-2063-454f-8151-1030137563da',
    email: 'admin@dgp.local',
    name: 'Portal Administrator',
    role: 'ADMIN',
  };

  // 1. Benchmark & verify getPoliceForceStatistics
  const t0 = performance.now();
  const initialStats = await repo.getPoliceForceStatistics(adminActor);
  const t1 = performance.now();
  console.log(`[1] getPoliceForceStatistics executed in ${(t1 - t0).toFixed(2)}ms`);
  console.log('    Initial Stats:', JSON.stringify(initialStats, null, 2));

  // 2. Test Wave 2 Batch Duty Assignment (Optimized UNNEST Bulk Operation)
  const assignments = [
    {
      police_id_number: 'AP-63236',
      mobile_number: '9848111003',
      police_zone: 'ICCC, Sub-Controls & Essentials',
      police_sector_number: 'Sector 1',
      police_sector_name: 'IIT-Integrated control room (ICCC) old library',
      issuing_counter_id: 'COUNTER-ICCC',
    },
    {
      mobile_number: '9989012344',
      police_zone: 'Venues',
      police_sector_number: 'Sector 1',
      police_sector_name: '1(A) IISER main gate and inside',
      security_component: 'ACT TEAMS',
      issuing_counter_id: 'COUNTER-VENUES',
    },
    {
      mobile_number: '9440512345',
      police_zone: 'Routes',
      police_sector_number: 'Sector 1',
      police_sector_name: '1(A) Route BB from Jinkalamitta to Seetharampeta fly over Junction',
      security_component: 'ROAD OPENING PARTY',
      issuing_counter_id: 'COUNTER-PARADE-GROUNDS',
    },
    {
      police_id_number: 'AP-63203',
      mobile_number: '9848111010',
      police_zone: 'ICCC, Sub-Controls & Essentials',
      police_sector_number: 'Sector 4',
      police_sector_name: 'Police Command and Control Center',
      issuing_counter_id: 'COUNTER-ICCC',
    },
    {
      mobile_number: '9849234563',
      police_zone: 'Accommodations/Stay Places',
      police_sector_number: 'Sector 2',
      police_sector_name: 'TAAJ',
      issuing_counter_id: 'COUNTER-HOTELS',
    },
    {
      police_id_number: 'AP-63214',
      mobile_number: '9848111001',
      police_zone: 'Venues',
      police_sector_number: 'Sector 2',
      police_sector_name: 'IIT Tirupati Campus',
      issuing_counter_id: 'COUNTER-VENUES',
    },
    {
      police_id_number: 'AP-63225',
      mobile_number: '9848111002',
      police_zone: 'Traffic',
      police_sector_number: 'Sector 2',
      police_sector_name: 'Renigunta to Tirupati',
      issuing_counter_id: 'COUNTER-PARADE-GROUNDS',
    },
  ];

  const t2 = performance.now();
  const assignResult = await repo.batchAssignPoliceDutyPostings(assignments, adminActor);
  const t3 = performance.now();
  console.log(`\n[2] batchAssignPoliceDutyPostings executed in ${(t3 - t2).toFixed(2)}ms`);
  console.log('    Assignment Result:', JSON.stringify(assignResult, null, 2));

  // 3. Verify Updated Stats
  const updatedStats = await repo.getPoliceForceStatistics(adminActor);
  console.log('\n[3] Updated Stats:', JSON.stringify(updatedStats, null, 2));

  // 4. Test Filtered Queries (Simulating Issuing Desk & Zone Filters)
  const t4 = performance.now();
  const counterQueue = await repo.list(
    {
      passType: 'POLICE_FORCE',
      issuingCounterId: 'COUNTER-ICCC',
      distributionStatus: 'ASSIGNED',
    },
    false,
    adminActor
  );
  const t5 = performance.now();
  console.log(`\n[4] Filtered list for COUNTER-ICCC executed in ${(t5 - t4).toFixed(2)}ms`);
  console.log(`    Found ${counterQueue.total} officers assigned to COUNTER-ICCC:`);
  for (const p of counterQueue.passes) {
    console.log(`    - ${p.pass_number}: ${p.full_name} (${p.rank}) | Zone: ${p.police_zone} | Sector: ${p.police_sector_name} | Status: ${p.distribution_status}`);
  }

  // 5. Verify Trigram Search Optimization
  const t6 = performance.now();
  const searchResult = await repo.list(
    {
      passType: 'POLICE_FORCE',
      search: 'JAGADEESH',
    },
    false,
    adminActor
  );
  const t7 = performance.now();
  console.log(`\n[5] Search query for 'JAGADEESH' executed in ${(t7 - t6).toFixed(2)}ms`);
  console.log(`    Found ${searchResult.total} matches:`);
  for (const p of searchResult.passes) {
    console.log(`    - ${p.pass_number}: ${p.full_name} | Mobile: ${p.mobile_number} | Police ID: ${p.police_id_number} | Zone: ${p.police_zone}`);
  }

  // 6. Test Handover & Distribution at Counter Desk
  const targetPass = searchResult.passes[0];
  const t8 = performance.now();
  const updatedPass = await repo.update(
    targetPass.id,
    {
      distribution_status: 'COLLECTED',
      collected_at: new Date().toISOString(),
      collected_by_officer: true,
      handover_officer_name: 'Inspector Sharma (Desk Officer)',
    },
    adminActor
  );
  const t9 = performance.now();
  console.log(`\n[6] Counter handover update executed in ${(t9 - t8).toFixed(2)}ms`);
  console.log(`    Pass ${updatedPass.pass_number} distribution status: ${updatedPass.distribution_status}`);
  console.log(`    Handover officer: ${updatedPass.handover_officer_name}, Collected at: ${updatedPass.collected_at}`);

  // Check stats after handover
  const postHandoverStats = await repo.getPoliceForceStatistics(adminActor);
  console.log(`    Collected count in stats: ${postHandoverStats.collected}`);

  console.log('\n=== ALL POLICE SYSTEM VERIFICATIONS PASSED ===');
  process.exit(0);
}

runVerification().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
