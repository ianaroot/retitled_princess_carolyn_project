import profileCollector from 'gameplay/profile_collector'
import { Candidate } from 'editorV2/panels/condition_preview/shared/candidate'
import { CandidateVerifier } from 'editorV2/panels/condition_preview/shared/candidate_verifier'
import { ExampleFactory } from 'editorV2/panels/condition_preview/shared/example_factory'
import { buildAttempt } from 'editorV2/panels/condition_preview/forward_proposition/build_engine'
import { createCoverageRecord, STANDARD_KEY } from 'editorV2/panels/condition_preview/forward_proposition/coverage_record'
import { clearPlanCache } from 'editorV2/panels/condition_preview/forward_proposition/relations/attack_or_defend'
import { eligibleScenariosFor } from 'editorV2/panels/condition_preview/forward_proposition/scenarios/eligibility'
import { SCENARIO_REGISTRY } from 'editorV2/panels/condition_preview/forward_proposition/scenarios/registry'
import { standardScenario } from 'editorV2/panels/condition_preview/forward_proposition/scenarios/standard'

const DEFAULT_ATTEMPTS = 200
const SPECIAL_SHIFT_ATTEMPTS = 400
// Split evenly across a group's eligible scenarios.
const SPECIAL_GROUP_TARGET = 40

function bump(produced, key) {
  produced[key] = (produced[key] ?? 0) + 1
}

function runScenario({
  combinedPlan, scenario, budget, random, deadline, verifier, factory,
  addUnique, standardExamples, produced, poolCap, shiftKey, scenarioCap, counter,
  coverageRecord
}) {
  const scenarioName = scenario.moveKind ?? STANDARD_KEY
  for (let i = 0; i < budget; i += 1) {
    if (scenarioCap != null && counter.n >= scenarioCap) { return 'scenario_full' }
    if (standardExamples.length >= poolCap) { return 'pool_full' }
    if (Date.now() > deadline) { return 'deadline' }
    const attempt = buildAttempt(combinedPlan, random, scenario, coverageRecord)
    if (!attempt) {
      profileCollector.increment('forward_proposition.attempt.build_failed')
      continue
    }
    const { move, binding } = attempt
    const candidate = new Candidate({ priorBoard: move.priorBoard, moveObject: move.moveObject })
    const cause = verifier.rejectionCause(candidate)
    if (cause !== null) {
      profileCollector.increment('forward_proposition.attempt.verifier_rejected')
      profileCollector.increment(`forward_proposition.attempt.verifier_rejected.${cause}`)
      continue
    }
    profileCollector.increment('forward_proposition.attempt.verifier_passed')
    const example = factory.build(candidate, { generationPath: 'forward-proposition', binding, priorPieces: move.priorPieces })
    if (!example) { continue }
    bump(produced, 'forward-proposition')
    bump(produced, shiftKey)
    counter.n += 1
    const sizeBefore = standardExamples.length
    addUnique(example, standardExamples)
    if (standardExamples.length > sizeBefore) {
      coverageRecord.noteVerifiedExample(scenarioName, example.bindingComboKey)
    }
  }
  return 'budget_exhausted'
}

export function collectForwardPropositionExamples({
  combinedPlan, random, maxStandardSize, addUnique, standardExamples, produced,
  attempts = DEFAULT_ATTEMPTS, deadline = Infinity,
  specialShiftAttempts = SPECIAL_SHIFT_ATTEMPTS,
  specialGroupTarget = SPECIAL_GROUP_TARGET
}) {
  if (combinedPlan.plans.length === 0) { return }
  clearPlanCache()
  const verifier = new CandidateVerifier({ combinedPlan })
  const factory = new ExampleFactory({ combinedPlan })
  const coverageRecord = createCoverageRecord()
  const eligible = eligibleScenariosFor(combinedPlan, SCENARIO_REGISTRY)

  const eligiblePerGroup = {}
  for (const scenario of eligible) {
    eligiblePerGroup[scenario.moveKind] = (eligiblePerGroup[scenario.moveKind] ?? 0) + 1
  }

  for (const { scenario, budget } of specialScenarioBudgets(eligible, specialShiftAttempts)) {
    const scenarioCap = Math.floor(specialGroupTarget / eligiblePerGroup[scenario.moveKind])
    const stop = runScenario({
      combinedPlan, scenario, budget, random, deadline, verifier, factory,
      addUnique, standardExamples, produced,
      poolCap: maxStandardSize, shiftKey: 'forward-proposition.special',
      scenarioCap, counter: { n: 0 }, coverageRecord
    })
    if (stop === 'pool_full' || stop === 'deadline') { return }
  }

  runScenario({
    combinedPlan, scenario: standardScenario, budget: attempts, random, deadline,
    verifier, factory, addUnique, standardExamples, produced,
    poolCap: maxStandardSize, shiftKey: 'forward-proposition.standard',
    scenarioCap: null, counter: { n: 0 }, coverageRecord
  })
}

export function specialScenarioBudgets(eligibleScenarios, specialAttempts) {
  const weightSum = eligibleScenarios.reduce((sum, s) => sum + (s.attemptWeight ?? 0), 0)
  if (weightSum === 0) { return [] }
  return eligibleScenarios.map(scenario => ({
    scenario,
    budget: Math.ceil(specialAttempts * ((scenario.attemptWeight ?? 0) / weightSum))
  }))
}
