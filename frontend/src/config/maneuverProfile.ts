export const MANEUVER_ANGLE_RANGE = {
  minimum: 0,
  maximum: 180,
  step: 5,
  initialMinimum: 40,
  initialMaximum: 100,
} as const

export const MANEUVER_SOG_INSIGHTS = {
  entry: { firstOffsetSeconds: -25, lastOffsetSeconds: -15, minimumSupportedPositions: 8 },
  minimum: { firstOffsetSeconds: -10, lastOffsetSeconds: 10, minimumSupportedPositions: 21 },
  similarityKnots: 0.2,
} as const
