import { buildCombinedPlan } from 'editorV2/panels/condition_preview/plans/plan'
import { exampleFingerprint } from 'editorV2/panels/condition_preview/shared/example_utils'
import { assembleWithSpecialQuota } from 'editorV2/panels/condition_preview/shared/example_assembly'
import { collectForwardPropositionExamples } from 'editorV2/panels/condition_preview/forward_proposition/collect'

const SOFT_TIMEOUT_MS = 10000
const MAX_DEFAULT_EXAMPLES = 30
const MAX_CANDIDATE_POOL = 400
const FORWARD_PROPOSITION_ATTEMPTS = 1200

const NO_EXAMPLES_REASON = "Couldn't build a verified example for this condition yet. This may mean the condition is unsatisfiable, or that the preview generator still needs work."

function makeAdder(seen) {
  return function addUnique(example, pool) {
    const id = exampleFingerprint(example)
    if (seen.has(id)) { return }
    seen.add(id)
    pool.push(example)
  }
}

const PIPELINE_KEYS = Object.freeze([
  'forward-proposition',
  'forward-proposition.standard',
  'forward-proposition.special'
])

function emptyPipelineCounter() {
  const counter = {}
  for (const key of PIPELINE_KEYS) { counter[key] = 0 }
  return counter
}

function collectAllExamples({ combinedPlan, random, deadline = Infinity }) {
  const seen = new Set()
  const addUnique = makeAdder(seen)
  const standardExamples = []
  const produced = emptyPipelineCounter()

  if (combinedPlan.plans.length > 0) {
    collectForwardPropositionExamples({
      combinedPlan, random,
      maxStandardSize: MAX_CANDIDATE_POOL, attempts: FORWARD_PROPOSITION_ATTEMPTS,
      addUnique, standardExamples, produced, deadline
    })
  }

  return { standardExamples, produced }
}

function emitStats(options, payloadArray, produced, finalExamples, startTime) {
  const onComplete = options.stats?.onComplete
  if (!onComplete) { return }
  const survived = emptyPipelineCounter()
  for (const example of finalExamples) {
    if (example.enriched) { continue }
    if (example.generationPath in survived) {
      survived[example.generationPath] += 1
    }
  }
  onComplete({
    ts: new Date().toISOString(),
    node_ids: options.nodeIds ?? null,
    payloads: payloadArray,
    produced,
    survived,
    total_survived: finalExamples.length,
    elapsed_ms: Date.now() - startTime
  })
}

export function generateConditionExamples(payloads, options = {}) {
  const maxExamples = options.maxExamples ?? MAX_DEFAULT_EXAMPLES
  const random = options.random ?? Math.random
  const softTimeoutMs = options.softTimeoutMs ?? SOFT_TIMEOUT_MS
  const startTime = Date.now()
  const deadline = startTime + softTimeoutMs

  const payloadArray = Array.isArray(payloads) ? payloads : [payloads]
  const combinedPlan = buildCombinedPlan(payloadArray, options)

  if (combinedPlan.status !== 'supported') {
    return { status: combinedPlan.status, reason: combinedPlan.reason, examples: [], payloadCount: payloadArray.length }
  }
  const { standardExamples, produced } = collectAllExamples({ combinedPlan, random, deadline })
  const timedOut = Date.now() > deadline
  if (standardExamples.length === 0) {
    emitStats(options, payloadArray, produced, [], startTime)
    if (timedOut) {
      return { status: 'slow', reason: `Generation paused after ${softTimeoutMs}ms — no examples found yet.`, examples: [], payloadCount: payloadArray.length }
    }
    return { status: 'no_examples', reason: NO_EXAMPLES_REASON, examples: [], payloadCount: payloadArray.length }
  }
  const finalExamples = assembleWithSpecialQuota({
    examples: standardExamples, combinedPlan, maxExamples, random
  })
  emitStats(options, payloadArray, produced, finalExamples, startTime)
  const status = timedOut && finalExamples.length < maxExamples ? 'slow' : 'ready'
  return {
    status,
    reason: status === 'slow' ? `Generation paused after ${softTimeoutMs}ms — ${finalExamples.length} examples found so far.` : null,
    payloadCount: payloadArray.length,
    examples: finalExamples
  }
}

export default generateConditionExamples
