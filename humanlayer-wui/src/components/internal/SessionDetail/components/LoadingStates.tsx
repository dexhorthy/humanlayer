import { useMemo } from 'react'

const ROBOT_VERBS = [
  'riffing',
  'vibing',
  'schlepping',
  'ideating',
  'thriving',
  'frolicking',
  'photosynthesizing',
  'prototyping',
  'finagling',
  'overcomplicating',
  'clauding',
  'generating',
  'proliferating',
  'quantizing',
  'enshrining',
  'collapsing',
  'amplifying',
  'inducting',
  'capacitizing',
  'conducting',
  'densifying',
  'diffusing',
  'attending',
  'propagating',
  'fusing',
  'gravitating',
  'potentiating',
  'radiating',
  'reflecting',
  'simplifying',
  'superconducting',
  'fixating',
  'transisting',
  'accelerating',
  'transcribing',
  'receiving',
  'adhering',
  'connecting',
  'sublimating',
  'balancing',
  'ionizing',
  'actuating',
  'mechanizing',
  'harmonizing',
]

interface LoadingStatesProps {
  randomVerb: string
}

export function LoadingStates({ randomVerb }: LoadingStatesProps) {
  // Randomly choose spinner type on mount (0: fancy, 1: simple, 2: bars)
  const spinnerType = useMemo(() => {
    const types = [0, 1, 3] // Excluding 2 (minimal)
    return types[Math.floor(Math.random() * types.length)]
  }, [])

  // Fancy complex spinner
  const fancySpinner = (
    <div className="relative w-10 h-10">
      {/* Outermost orbiting particles */}
      <div className="absolute inset-0 animate-spin-slow">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary/40 animate-pulse" />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary/40 animate-pulse delay-75" />
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-1 rounded-full bg-primary/40 animate-pulse delay-150" />
        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-1 rounded-full bg-primary/40 animate-pulse delay-300" />
      </div>

      {/* Outer gradient ring */}
      <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-primary/0 via-primary/30 to-primary/0 animate-spin" />

      {/* Mid rotating ring with gradient */}
      <div className="absolute inset-1 rounded-full">
        <div className="absolute inset-0 rounded-full bg-gradient-conic from-primary/10 via-primary/50 to-primary/10 animate-spin-reverse" />
      </div>

      {/* Inner wave ring */}
      <div className="absolute inset-2 rounded-full overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/30 via-transparent to-primary/30 animate-wave" />
      </div>

      {/* Morphing core */}
      <div className="absolute inset-3 animate-morph">
        <div className="absolute inset-0 rounded-full bg-gradient-radial from-primary/60 to-primary/20 blur-sm" />
        <div className="absolute inset-0 rounded-full bg-gradient-to-br from-primary/40 to-transparent" />
      </div>

      {/* Center glow */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative">
          <div className="absolute w-2 h-2 rounded-full bg-primary/80 animate-ping" />
          <div className="relative w-2 h-2 rounded-full bg-primary animate-pulse-bright" />
        </div>
      </div>

      {/* Random glitch effect */}
      <div className="absolute inset-0 rounded-full opacity-20 animate-glitch" />
    </div>
  )

  // Simple minimal spinner
  const simpleSpinner = (
    <div className="relative w-10 h-10">
      {/* Single spinning ring */}
      <div className="absolute inset-0 rounded-full border-2 border-primary/20 border-t-primary/60 animate-spin" />

      {/* Pulsing center dot */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-2 h-2 rounded-full bg-primary/50 animate-pulse" />
      </div>

      {/* Simple gradient overlay */}
      <div className="absolute inset-0 rounded-full bg-gradient-to-br from-primary/10 to-transparent" />
    </div>
  )

  // Ultra minimal spinner
  const minimalSpinner = (
    <div className="relative w-10 h-10">
      {/* Three dots rotating */}
      <div className="absolute inset-0 animate-spin">
        <div className="absolute top-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-primary/60" />
        <div className="absolute bottom-1 left-2 w-1.5 h-1.5 rounded-full bg-primary/40" />
        <div className="absolute bottom-1 right-2 w-1.5 h-1.5 rounded-full bg-primary/40" />
      </div>
    </div>
  )

  // Bouncing bars spinner
  const barsSpinner = (
    <div className="relative w-10 h-10 flex items-center justify-center gap-1">
      {/* Five bouncing bars */}
      <div className="w-1 h-6 bg-primary/40 rounded-full animate-bounce-slow" />
      <div className="w-1 h-8 bg-primary/60 rounded-full animate-bounce-medium" />
      <div className="w-1 h-5 bg-primary/80 rounded-full animate-bounce-fast" />
      <div className="w-1 h-7 bg-primary/60 rounded-full animate-bounce-medium delay-150" />
      <div className="w-1 h-4 bg-primary/40 rounded-full animate-bounce-slow delay-300" />
    </div>
  )

  // Select spinner based on random type
  const spinner =
    spinnerType === 0
      ? fancySpinner
      : spinnerType === 1
        ? simpleSpinner
        : spinnerType === 2
          ? minimalSpinner
          : barsSpinner

  return (
    <div className="flex items-center gap-3 mt-4 pl-4">
      {spinner}
      <p className="text-sm font-medium text-muted-foreground opacity-80 animate-fade-pulse">
        {randomVerb}
      </p>
    </div>
  )
}

// Export the verbs array for use in SessionDetail
export { ROBOT_VERBS }
