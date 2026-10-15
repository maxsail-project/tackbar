export const HEEL_SOG_DENSITY_CONFIG = {
  heelMinimumDegrees: -40,
  heelMaximumDegrees: 40,
  heelBinDegrees: 2,
  sogMinimumKnots: 0,
  sogBinKnots: 0.25,
  maxGapSeconds: 1.5,
  minimumCellOpacity: 0.12,
  maximumCellOpacity: 0.9,
  viewBoxWidth: 640,
  viewBoxHeight: 320,
  plotMargin: {
    top: 12,
    right: 16,
    bottom: 42,
    left: 52,
  },
} as const
