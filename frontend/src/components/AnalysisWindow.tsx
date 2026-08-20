export default function AnalysisWindow() {
  return (
    <section className="content-section" aria-labelledby="analysis-window-title">
      <div className="section-heading">
        <div>
          <p className="section-kicker" id="analysis-window-title">Analysis window</p>
          <p className="section-description">One shared absolute GPS range</p>
        </div>
        <span className="duration-pill">19 min</span>
      </div>

      <div className="window-scale" aria-label="Static analysis window placeholder">
        <span>11:10</span>
        <div className="window-track">
          <span className="window-selection" />
          <span className="window-handle window-handle--start" />
          <span className="window-handle window-handle--end" />
        </div>
        <span>12:10</span>
      </div>
      <div className="window-values" aria-hidden="true">
        <span>11:18</span>
        <span>11:37</span>
      </div>
    </section>
  )
}

