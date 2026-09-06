import type { StrategicWarHistoryEntry } from "./game-engine";
import { AGE_GROUPS, type PopulationAccounting } from "./population-model";

const ages = ["0-14 lat", "15-24 lata", "25-44 lata", "45-64 lata", "65-79 lat", "80+ lat"];
const flows: [keyof PopulationAccounting, string, number][] = [
  ["naturalChange", "Urodzenia minus zgony naturalne", 1],
  ["combatDeaths", "Polegli", -1],
  ["refugeesIn", "Przyjęci uchodźcy", 1],
  ["refugeesOut", "Uchodźcy za granicę", -1],
  ["territoryIn", "Mieszkańcy przejętych regionów", 1],
  ["territoryOut", "Mieszkańcy utraconych regionów", -1],
];
const number = (n: number) => Math.round(n).toLocaleString("pl-PL");
const signed = (n: number) => `${n > 0 ? "+" : ""}${number(n)}`;

export function WarPopulationBalance({ war, attackerName, defenderName }: {
  war: StrategicWarHistoryEntry; attackerName: string; defenderName: string;
}) {
  if (!war.populationBefore || !war.populationAfter) return <p className="war-report-note">Starszy zapis nie zawiera ludności sprzed tej wojny. Pełny bilans będzie dostępny dla nowych kampanii.</p>;
  return <section className="war-population-balance">
    <h3>Bilans ludności obu państw</h3>
    <p>Pomiar początkowy w turze {war.populationBaselineTurn ?? war.startedTurn}, końcowy po turze {war.endedTurn}. Obejmuje całe państwa, również inne fronty działające w tym czasie. Mieszkańcy przejętego regionu zmieniają państwo, nie muszą się przeprowadzać.</p>
    <div className="war-census-cards">{(["attacker", "defender"] as const).map((side) => {
      const before = war.populationBefore![side], after = war.populationAfter![side];
      return <article key={side}>
        <h4>{side === "attacker" ? attackerName : defenderName}</h4>
        <dl><div><dt>Przed</dt><dd>{number(before.population)}</dd></div><div><dt>Po</dt><dd>{number(after.population)}</dd></div><div className="census-total"><dt>Zmiana</dt><dd>{signed(after.population - before.population)}</dd></div></dl>
        <dl className="census-flows">{flows.map(([key, label, sign]) => <div key={key}><dt>{label}</dt><dd>{signed(sign * (after.accounting[key] - before.accounting[key]))}</dd></div>)}</dl>
        <details><summary>Zmiana struktury wieku</summary><table><thead><tr><th>Wiek</th><th>Przed</th><th>Po</th></tr></thead><tbody>{AGE_GROUPS.map((key, i) => <tr key={key}><th>{ages[i]}</th><td>{before.population ? `${(before.demographics[key] * 100).toFixed(1)}%` : "brak"}</td><td>{after.population ? `${(after.demographics[key] * 100).toFixed(1)}%` : "brak"}</td></tr>)}</tbody></table></details>
      </article>;
    })}</div>
    {!!war.territoryPopulation && <p>W chwili przejęcia w spornym regionie mieszkało {number(war.territoryPopulation)} osób.</p>}
  </section>;
}
