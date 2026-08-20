interface ComparisonTableProps {
  primaryLabel: string
  comparisonLabel?: string
}

const rows = ['Distance', 'Avg SOG', 'Dominant COG', 'Heel', 'Trim']

export default function ComparisonTable({
  primaryLabel,
  comparisonLabel,
}: ComparisonTableProps) {
  return (
    <section className="content-section" aria-labelledby="comparison-title">
      <p className="section-kicker" id="comparison-title">Comparison</p>
      <div className="comparison-table-wrap">
        <table className="comparison-table">
          <thead>
            <tr>
              <th scope="col">Metric</th>
              <th scope="col">{primaryLabel}</th>
              {comparisonLabel && <th scope="col">{comparisonLabel}</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row}>
                <th scope="row">{row}</th>
                <td>—</td>
                {comparisonLabel && <td>—</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

