import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Settings as SettingsIcon, RotateCcw } from 'lucide-react'
import { getFSRSParams, saveFSRSParams } from '../lib/db'
import { clearSchedulerCache } from '../lib/scheduler'
import { generatorParameters, type FSRSParameters } from 'ts-fsrs'

const PARAM_INFO: { key: keyof FSRSParameters; label: string; description: string; type: 'number' | 'boolean' | 'steps' }[] = [
  { key: 'request_retention', label: 'Desired Retention', description: 'Target probability of recalling a card when reviewed (0-1)', type: 'number' },
  { key: 'maximum_interval', label: 'Maximum Interval', description: 'Maximum number of days between reviews', type: 'number' },
  { key: 'enable_fuzz', label: 'Enable Fuzz', description: 'Add small random variation to intervals to avoid clustering reviews', type: 'boolean' },
  { key: 'enable_short_term', label: 'Enable Short-Term', description: 'Apply (re)learning steps for new and lapsed cards', type: 'boolean' },
  { key: 'learning_steps', label: 'Learning Steps', description: 'Steps for new cards (e.g. 1m, 10m)', type: 'steps' },
  { key: 'relearning_steps', label: 'Relearning Steps', description: 'Steps for lapsed cards (e.g. 10m)', type: 'steps' },
]

export default function Settings() {
  const [params, setParams] = useState<FSRSParameters | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    getFSRSParams().then(setParams)
  }, [])

  const handleSave = async () => {
    if (!params) return
    await saveFSRSParams(params)
    clearSchedulerCache()
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleReset = async () => {
    const defaults = generatorParameters({ enable_short_term: false })
    setParams(defaults)
    await saveFSRSParams(defaults)
    clearSchedulerCache()
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (!params) return null

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="flex items-center gap-3 mb-8">
        <Link to="/" className="text-gray-400 hover:text-gray-600 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="text-gray-500 bg-gray-200 p-2 rounded">
          <SettingsIcon className="w-5 h-5" />
        </div>
        <h1 className="text-2xl text-gray-800 font-semibold">FSRS Parameters</h1>
      </div>

      <div className="flex flex-col gap-4">
        {/* Main parameters */}
        <div className="shrink-0 flex flex-col rounded-lg border border-gray-300 bg-white pb-4 w-full">
          <div className="shrink-0 flex items-center p-3 gap-2 border-b border-gray-200">
            <span className="text-lg text-gray-800 font-semibold">Scheduling</span>
          </div>
          <div className="p-4 flex flex-col gap-5">
            {PARAM_INFO.map(({ key, label, description, type }) => (
              <div key={key}>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm text-gray-800 font-medium">{label}</label>
                  {type === 'boolean' && (
                    <button
                      onClick={() => setParams({ ...params, [key]: !params[key] })}
                      className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer ${params[key] ? 'bg-gray-800' : 'bg-gray-300'}`}
                    >
                      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${params[key] ? 'left-5.5' : 'left-0.5'}`} />
                    </button>
                  )}
                </div>
                <p className="text-xs text-gray-400 mb-2">{description}</p>
                {type === 'number' && (
                  <input
                    type="number"
                    step={key === 'request_retention' ? 0.01 : 1}
                    min={key === 'request_retention' ? 0 : 1}
                    max={key === 'request_retention' ? 1 : undefined}
                    value={params[key] as number}
                    onChange={(e) => setParams({ ...params, [key]: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:border-gray-400"
                  />
                )}
                {type === 'steps' && (
                  <input
                    type="text"
                    value={(params[key] as string[]).join(', ')}
                    onChange={(e) => {
                      const steps = e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                      setParams({ ...params, [key]: steps })
                    }}
                    placeholder="1m, 10m"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono outline-none focus:border-gray-400"
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Model Weights */}
        <div className="shrink-0 flex flex-col rounded-lg border border-gray-300 bg-white pb-4 w-full">
          <div className="shrink-0 flex items-center p-3 gap-2 border-b border-gray-200">
            <span className="text-lg text-gray-800 font-semibold">Model Weights</span>
          </div>
          <p className="px-4 pt-3 text-xs text-gray-400">
            Advanced: 19 FSRS model weights (w0–w18). Only change if you've trained custom parameters.
          </p>
          <div className="p-4 grid grid-cols-4 sm:grid-cols-5 gap-2">
            {(params.w as number[]).map((val, i) => (
              <div key={i} className="flex flex-col">
                <label className="text-xs text-gray-400 mb-0.5">w{i}</label>
                <input
                  type="number"
                  step={0.0001}
                  value={val}
                  onChange={(e) => {
                    const newW = [...(params.w as number[])]
                    newW[i] = parseFloat(e.target.value) || 0
                    setParams({ ...params, w: newW })
                  }}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs font-mono outline-none focus:border-gray-400"
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Action bar */}
      <div className="flex items-center gap-3 mt-6">
        <button
          onClick={handleSave}
          className="px-5 py-2.5 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors cursor-pointer text-sm font-medium"
        >
          {saved ? 'Saved!' : 'Save Parameters'}
        </button>
        <button
          onClick={handleReset}
          className="flex items-center gap-1.5 px-4 py-2.5 text-gray-600 hover:text-gray-800 transition-colors cursor-pointer text-sm"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reset to Defaults
        </button>
      </div>
    </div>
  )
}
