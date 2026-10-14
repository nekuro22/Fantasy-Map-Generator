// The Factions Editor: alliances and blocs of states under a leader, as in Hearts of Iron. Members are allies of each
// other, a faction's leader can call the members to its wars, and the Factions layer shows who belongs where
import { confirmationDialog } from "@/components/dialog/dialog-helpers";
import { Layers } from "@/components/layers";
import { tip } from "@/components/tooltips";
import { FACTION_TYPES, type Faction } from "@/generators/factions-generator";
import { translate } from "@/services/i18n";
import { errorText } from "@/utils/stringUtils";
import { ensureEl, escapeHtml } from "../utils";

const DIALOG_ID = "factionsEditor";

const livingStates = () => pack.states.filter(s => s.i && !s.removed);
const stateName = (id: number) => `<b class="notranslate">${escapeHtml(pack.states[id]?.name ?? "?")}</b>`;

function factionHtml(faction: Faction): string {
  const members = faction.members
    .map(
      id => /* html */ `<span class="facMember" data-state="${id}" style="display: inline-flex; gap: .25em; align-items: center; margin: 0 .5em .2em 0; padding: 0 .3em; border: 1px solid #8886; border-radius: 3px">
        <span class="facLeader pointer ${id === faction.leader ? "icon-star" : "icon-star-empty"}" data-tip="${id === faction.leader ? "The leader of the faction" : "Make this state the leader"}"></span>
        ${stateName(id)}
        <span class="facLeave pointer icon-cancel" data-tip="Remove this state from the faction"></span>
      </span>`
    )
    .join("");
  const candidates = livingStates().filter(s => !Factions.of(s.i));
  const add = candidates.length
    ? `<select class="facAddState" data-tip="A state that is in no faction yet">${candidates
        .map(s => `<option value="${s.i}" class="notranslate">${escapeHtml(s.name)}</option>`)
        .join(
          ""
        )}</select> <button class="facAdd" data-tip="Add the state to the faction: it becomes an ally of every member and cannot be at war with one">Add state</button>`
    : "";
  return /* html */ `<div class="facRow" data-id="${faction.i}" style="padding: 5px 0; border-top: 1px solid #8884">
    <div style="display: flex; gap: .4em; align-items: center">
      <input type="color" class="facColor" value="${faction.color}" data-tip="Faction color on the map" style="width: 2em; height: 1.4em; padding: 0" />
      <input class="facName notranslate" value="${escapeHtml(faction.name)}" data-tip="Name of the faction" style="flex: 1" />
      <input class="facType" list="factionTypes" value="${escapeHtml(faction.type)}" data-tip="Kind of faction, such as Alliance, Pact or Bloc" style="width: 8em" />
      <span class="facDissolve pointer icon-trash-empty" data-tip="End the faction. The members stay allies"></span>
    </div>
    <div style="margin: .3em 0 .1em">${members}</div>
    <div style="display: flex; gap: .4em; align-items: center">${add}
      <button class="facArms" data-tip="The members join every war of the leader">Call to arms</button>
      ${faction.founded !== undefined ? `<span style="opacity: .7">${translate("founded")} ${faction.founded}</span>` : ""}
    </div>
  </div>`;
}

function render(): void {
  const factions = Factions.all();
  const free = livingStates().filter(s => !Factions.of(s.i));
  ensureEl("factionsBody").innerHTML = /* html */ `
    <datalist id="factionTypes">${FACTION_TYPES.map(t => `<option value="${t}"></option>`).join("")}</datalist>
    <p style="margin: 0 0 .4em">${translate("Factions are alliances under a leader. Members are allies of each other and join the leader's wars when called")}.</p>
    <div id="factionsList" style="max-height: 24em; overflow-y: auto">${factions.map(factionHtml).join("") || `<i>${translate("No factions")}</i>`}</div>
    <div style="border-top: 1px solid #8884; padding-top: 5px; margin-top: 4px">
      ${
        free.length
          ? `<select id="facNewLeader" data-tip="The state that founds the faction and leads it">${free
              .map(s => `<option value="${s.i}" class="notranslate">${escapeHtml(s.name)}</option>`)
              .join(
                ""
              )}</select> <button id="facNew" data-tip="Found a new faction led by this state">New faction</button>`
          : ""
      }
      <button id="facGenerate" data-tip="Build factions from the alliances of the map. Replaces all factions">Generate</button>
    </div>`;
}

const redraw = () => Layers.draw("factionLands");

function act(action: () => void): void {
  try {
    action();
  } catch (error) {
    tip(errorText(error), false, "error");
    return;
  }
  render();
  redraw();
}

function onClick(event: Event): void {
  const el = event.target as HTMLElement;
  const row = el.closest<HTMLElement>(".facRow");
  const id = row ? +row.dataset.id! : 0;
  if (el.id === "facNew") {
    act(() => {
      const leader = +ensureEl<HTMLSelectElement>("facNewLeader").value;
      Factions.create(`${pack.states[leader].name} ${translate("Alliance")}`, leader);
    });
    return;
  }
  if (el.id === "facGenerate") {
    confirmationDialog({
      title: "Generate factions",
      message: "Build factions from the alliances of the map? All factions are replaced",
      confirm: "Generate",
      onConfirm: () => act(() => Factions.generate())
    });
    return;
  }
  if (!row) return;
  const stateId = +(el.closest<HTMLElement>(".facMember")?.dataset.state ?? 0);
  if (el.classList.contains("facAdd"))
    act(() => Factions.join(id, +row.querySelector<HTMLSelectElement>(".facAddState")!.value));
  else if (el.classList.contains("facLeave")) act(() => Factions.leave(stateId));
  else if (el.classList.contains("facLeader")) act(() => Factions.setLeader(id, stateId));
  else if (el.classList.contains("facDissolve")) act(() => Factions.dissolve(id));
  else if (el.classList.contains("facArms"))
    act(() => {
      const declared = Factions.callToArms(id);
      tip(`${translate("Declarations of war")}: ${declared}`, true, declared ? "success" : "warn", 3500);
    });
}

function onChange(event: Event): void {
  const el = event.target as HTMLInputElement;
  const row = el.closest<HTMLElement>(".facRow");
  if (!row) return;
  const id = +row.dataset.id!;
  try {
    if (el.classList.contains("facColor")) Factions.recolor(id, el.value);
    else if (el.classList.contains("facName") || el.classList.contains("facType"))
      Factions.rename(
        id,
        row.querySelector<HTMLInputElement>(".facName")!.value,
        row.querySelector<HTMLInputElement>(".facType")!.value
      );
    redraw();
  } catch (error) {
    tip(errorText(error), false, "error");
    render();
  }
}

function open(): void {
  $(`#${DIALOG_ID}`).dialog("destroy").remove();
  ensureEl("dialogs").insertAdjacentHTML(
    "beforeend",
    `<div id="${DIALOG_ID}" class="dialog"><div id="factionsBody" style="width: 34em"></div></div>`
  );
  ensureEl("factionsBody").addEventListener("click", onClick);
  ensureEl("factionsBody").addEventListener("change", onChange);
  $(`#${DIALOG_ID}`).dialog({
    title: translate("Factions"),
    resizable: true,
    width: "fit-content",
    position: { my: "center", at: "center", of: "svg" },
    close: () => $(`#${DIALOG_ID}`).dialog("destroy").remove()
  });
  render();
  if (!layerOn()) tip("Show the Factions layer to see them on the map", true, "info", 4000);
}

const layerOn = () =>
  !!document.getElementById("factionLands") && getComputedStyle(ensureEl("factionLands")).display !== "none";

export const FactionsEditor = { open };
