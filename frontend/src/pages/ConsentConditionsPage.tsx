import TackBarBrand from '../components/TackBarBrand'

export default function ConsentConditionsPage() {
  return <div className="consent-shell">
    <header className="app-header consent-header"><TackBarBrand inverted /></header>
    <main className="conditions-page">
      <header className="conditions-title">
        <h1>TackBar Pilot Participation Conditions<br /><span>Condiciones de Participación en el Piloto TackBar</span></h1>
        <p><strong>Agreement version / Versión del acuerdo: v0.6.5</strong></p>
      </header>

      <article className="conditions-language" lang="en" aria-labelledby="conditions-en">
        <h2 id="conditions-en">English</h2>

        <h3>What TackBar is</h3>
        <p>TackBar is a pilot tool for reviewing sailing tracks and conducting a shared debrief with other participants.</p>

        <h3>How sailing tracks are used</h3>
        <p>TackBar may receive, store and process the tracks you provide in order to:</p>
        <ul>
          <li>include them in shared Sessions;</li>
          <li>visualize and analyze them together with tracks from other participants;</li>
          <li>retain an Activity history while you participate in the pilot;</li>
          <li>use derived or aggregated results for product improvement where appropriate.</li>
        </ul>

        <h3>Shared Sessions</h3>
        <p>Shared Sessions are opened through private capability links; they are not user accounts and do not require Sailor login. In the current PoC, shared access has an initial lifetime of 60 days. When a Session expires, its stored Activities are not automatically deleted.</p>
        <p>Activities may remain stored internally while your consent status is ACTIVE. If you withdraw consent, your Activities immediately stop being visible in shared Sessions. Withdrawal does not imply immediate physical deletion in the current PoC.</p>

        <h3>Administrative access</h3>
        <p>Authorized Admin access is limited, under product policy, to operation, support, maintenance, reprocessing and consent management.</p>

        <h3>Email channel</h3>
        <p><code>share@tackbar.eu</code> is currently the PoC email channel for receiving tracks and sending operational messages. Sending a track to this channel starts technical processing, but does not constitute consent to participate.</p>

        <h3>How to accept</h3>
        <p>To accept these conditions and participate in the pilot, you must use the explicit confirmation action on the TackBar application consent page. Opening the consent link, viewing this conditions page or sending a track does not constitute consent. Only explicit affirmative confirmation activates your participation.</p>
      </article>

      <article className="conditions-language" lang="es" aria-labelledby="conditions-es">
        <h2 id="conditions-es">Español</h2>

        <h3>Qué es TackBar</h3>
        <p>TackBar es una herramienta de prueba para revisar tracks de navegación y realizar un debriefing compartido con otros participantes.</p>

        <h3>Para qué se usan los tracks</h3>
        <p>TackBar puede recibir, almacenar y procesar los tracks que proporciones para:</p>
        <ul>
          <li>incluirlos en Sessions compartidas;</li>
          <li>visualizarlos y analizarlos junto con los de otros participantes;</li>
          <li>conservar un historial de tus Activities mientras participas en el piloto;</li>
          <li>utilizar resultados derivados o agregados para mejorar el producto cuando corresponda.</li>
        </ul>

        <h3>Sessions compartidas</h3>
        <p>Las Sessions compartidas se abren mediante enlaces privados de capability; no son cuentas de usuario ni requieren un login de Sailor. En la PoC actual, el acceso compartido tiene una duración inicial de 60 días. Cuando una Session expira, sus Activities almacenadas no se eliminan automáticamente.</p>
        <p>Las Activities pueden permanecer almacenadas internamente mientras tu estado de consentimiento sea ACTIVE. Si retiras el consentimiento, tus Activities dejan inmediatamente de ser visibles en Sessions compartidas. La retirada no implica el borrado físico inmediato en la PoC actual.</p>

        <h3>Acceso administrativo</h3>
        <p>El acceso Admin autorizado se limita, según la política del producto, a operación, soporte, mantenimiento, reprocesamiento y gestión del consentimiento.</p>

        <h3>Canal de email</h3>
        <p><code>share@tackbar.eu</code> es actualmente el canal de email de la PoC para recibir tracks y enviar mensajes operativos. Enviar un track a este canal inicia el procesamiento técnico, pero no constituye consentimiento para participar.</p>

        <h3>Cómo aceptar</h3>
        <p>Para aceptar estas condiciones y participar en el piloto debes realizar la acción explícita de confirmación en la página de consentimiento de la aplicación TackBar. Abrir el enlace de consentimiento, consultar esta página de condiciones o enviar un track no constituye consentimiento. Solo la confirmación afirmativa explícita activa tu participación.</p>
      </article>
    </main>
  </div>
}
