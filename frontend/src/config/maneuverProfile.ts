export const MANEUVER_ANGLE_RANGE = {
  minimum: 0,
  maximum: 180,
  step: 5,
  initialMinimum: 40,
  initialMaximum: 100,
} as const

export const MANEUVER_SOG_INSIGHTS = {
  profileHalfSpanSeconds: 25,
  entry: { firstOffsetSeconds: -25, lastOffsetSeconds: -15, minimumSupportedPositions: 8 },
  minimum: { firstOffsetSeconds: -10, lastOffsetSeconds: 10, minimumSupportedPositions: 21 },
  exit: { firstOffsetSeconds: 15, lastOffsetSeconds: 25, minimumSupportedPositions: 8 },
  similarityKnots: 0.2,
  recoveryFractionOfEntry: 0.95,
} as const

export const MANEUVER_COG_INSIGHTS = {
  entry: MANEUVER_SOG_INSIGHTS.entry,
  exit: MANEUVER_SOG_INSIGHTS.exit,
  centralStartSeconds: MANEUVER_SOG_INSIGHTS.entry.lastOffsetSeconds,
  centralEndSeconds: MANEUVER_SOG_INSIGHTS.exit.firstOffsetSeconds,
  startFraction: 0.1,
  endFraction: 0.9,
  confirmationSeconds: 2,
} as const

export const MANEUVER_HEEL_INSIGHTS = {
  entry: MANEUVER_SOG_INSIGHTS.entry,
  central: MANEUVER_SOG_INSIGHTS.minimum,
  exit: MANEUVER_SOG_INSIGHTS.exit,
} as const
