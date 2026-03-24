import { RunAnywhere, SDKEnvironment, ModelManager, ModelCategory, LLMFramework, EventBus } from '@runanywhere/web'
import { LlamaCPP } from '@runanywhere/web-llamacpp'

self.onmessage = async (e) => {
  const { type } = e.data

  if (type === 'INIT') {
    try {
      self.postMessage({ type: 'STATUS', text: 'Initializing...' })

      await RunAnywhere.initialize({ environment: SDKEnvironment.Development, debug: false })
      await LlamaCPP.register()

      RunAnywhere.registerModels([
        {
          id: 'lfm2-350m-q4_k_m',
          name: 'LFM2 350M',
          repo: 'LiquidAI/LFM2-350M-GGUF',
          files: ['LFM2-350M-Q4_K_M.gguf'],
          framework: LLMFramework.LlamaCpp,
          modality: ModelCategory.Language,
          memoryRequirement: 250_000_000,
        },
      ])

      EventBus.shared.on('model.downloadProgress', (evt) => {
        self.postMessage({ type: 'PROGRESS', value: (evt.progress ?? 0) * 100 })
      })

      await ModelManager.downloadModel('lfm2-350m-q4_k_m')

      self.postMessage({ type: 'READY' })
    } catch (err) {
      self.postMessage({ type: 'ERROR', message: err.message })
    }
  }
}
