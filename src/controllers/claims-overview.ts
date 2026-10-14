// Claims Overview: cores, claims, occupation and front lines per state, as in Hearts of Iron
import { select } from "d3";
import { closeDialogs, confirmationDialog, destroyDialog } from "@/components/dialog/dialog-helpers";
import { Layers } from "@/components/layers";
import { clearMainTip, tip } from "@/components/tooltips";
import { applyDefaultViewboxEvents } from "@/components/viewbox-events";
import { RELATIONS } from "@/data/diplomacy";
import { getDisputes, getStateClaims, type StateClaims } from "@/generators/claims-analysis";
import { EmblemRenderer } from "@/renderers/emblems/renderer";
import {
  type ClaimsMode,
  cellController,
  FOCUS_LEGEND,
  provinceTension,
  removeClaimsMap,
  showClaimsMap
} from "@/renderers/overlays/claims";
import { translate } from "@/services/i18n";
import { downloadFile, getFileName } from "@/utils";
import { ensureEl, findEl, getPointer } from "../utils";

const dialogId = "claimsOverview";
const position = { my: "right top", at: "right-10 top+10", of: "svg", collision: "fit" };

const COLUMNS: { key: keyof StateClaims; label: string; tip: string }[] = [
  { key: "provinces", label: "Prov.", tip: "Provinces the state owns" },
  { key: "cores", label: "Cores", tip: "Owned provinces the state holds a core on" },
  { key: "nonCore", label: "Non-core", tip: "Owned provinces without a core of the state: conquered or colonial land" },
  { key: "occupied", label: "Occupied", tip: "Own provinces held by an enemy" },
  { key: "occupying", label: "Occupying", tip: "Foreign provinces the state holds" },
  {
    key: "irredenta",
    label: "Irredenta",
    tip: "Cores of the state on land of other states: lost homeland it wants back"
  },
  { key: "claims", label: "Claims", tip: "Claims of the state on provinces of other states" },
  { key: "claimed", label: "Claimed", tip: "Own provinces other states claim or hold cores on" },
  {
    key: "tension",
    label: "Tension",
    tip: "How fought over the state is: claims, cores, occupation and wars with others"
  }
];

let mode: ClaimsMode = "focus";
let selected = 0;
let sortKey: keyof StateClaims = "tension";
let sortDesc = true;

function open(stateId?: number): void {
  if (customization) return;
  const living = pack.states.filter(s => s.i && !s.removed);
  if (!living.length) {
    tip("There are no states on the map", false, "error");
    return;
  }
  if (stateId && pack.states[stateId] && !pack.states[stateId].removed) selected = stateId;
  if (!selected || !pack.states[selected] || pack.states[selected].removed) {
    selected = getStateClaims().sort((a, b) => b.tension - a.tension)[0]?.i ?? living[0].i;
  }

  closeDialogs(`#${dialogId}, .stable`);
  Layers.show("states", "borders");
  renderDialog();
  refresh();

  select<SVGElement, unknown>("#viewbox")
    .style("cursor", "crosshair")
    .on("click", selectOnMap)
    .on("mousemove", showProvinceTip);

  $(`#${dialogId}`).dialog({
    title: "Claims & Fronts",
    resizable: false,
    width: "fit-content",
    close,
    position
  });
}

function renderDialog(): void {
  destroyDialog(dialogId);
  const modeButton = (id: ClaimsMode, label: string, tipText: string) =>
    /* html */ `<button data-mode="${id}" data-tip="${tipText}">${label}</button>`;
  const html = /* html */ `<div id="${dialogId}" class="dialog stable">
    <div id="claimsModes" class="claimsModes">
      ${modeButton("focus", "State", "What the selected state holds, has lost, occupies and claims")}
      ${modeButton("control", "Fronts", "Occupied land hatched in the occupier's color, front lines between states at war in red")}
      ${modeButton("tension", "Powder keg", "Provinces by how fought over they are: foreign cores, claims and occupation")}
    </div>
    <div id="claimsFocus" class="claimsFocus"></div>
    <div id="claimsLegend" class="claimsLegend"></div>
    <div id="claimsTable" class="claimsTable"></div>
    <div class="editorToolbar">
      <button id="claimsRefresh" data-tip="Refresh the overview" class="icon-cw"></button>
      <button id="claimsDisputes" data-tip="Show the hotspots: the most disputed pairs of states" class="icon-target"></button>
      <button id="claimsRegenerate" data-tip="Generate claims anew: peoples living abroad, rivals and occupiers. Replaces all claims and foreign cores" class="icon-retweet"></button>
      <button id="claimsOccupation" data-tip="Occupation from the wars: the stronger side holds border provinces of its enemy. Replaces all occupations" class="icon-flag"></button>
      <button id="claimsIntegrate" data-tip="Integrate: the selected state gets a core on every province it owns" class="icon-fort-awesome"></button>
      <button id="claimsPeace" data-tip="Peace conference: the selected state annexes the provinces it occupies; their old owners keep their cores" class="icon-balance-scale"></button>
      <button id="claimsWhitePeace" data-tip="White peace: the selected state and its enemies give back all occupied land" class="icon-ccw"></button>
      <button id="claimsExport" data-tip="Save the overview as a text file (.csv)" class="icon-download"></button>
    </div>
  </div>`;
  ensureEl("dialogs").insertAdjacentHTML("beforeend", html);

  ensureEl("claimsModes").addEventListener("click", event => {
    const button = (event.target as HTMLElement).closest<HTMLElement>("button[data-mode]");
    if (!button) return;
    mode = button.dataset.mode as ClaimsMode;
    refresh();
  });
  ensureEl("claimsTable").addEventListener("click", event => {
    const target = event.target as HTMLElement;
    const header = target.closest<HTMLElement>("th[data-key]");
    if (header) {
      const key = header.dataset.key as keyof StateClaims;
      sortDesc = key === sortKey ? !sortDesc : true;
      sortKey = key;
      return renderTable();
    }
    const row = target.closest<HTMLElement>("tr[data-id]");
    if (row) selectState(+row.dataset.id!);
  });
  ensureEl("claimsRefresh").addEventListener("click", refresh);
  ensureEl("claimsDisputes").addEventListener("click", showDisputes);
  ensureEl("claimsRegenerate").addEventListener("click", regenerateClaims);
  ensureEl("claimsOccupation").addEventListener("click", regenerateOccupation);
  ensureEl("claimsIntegrate").addEventListener("click", integrateCores);
  ensureEl("claimsPeace").addEventListener("click", peaceConference);
  ensureEl("claimsWhitePeace").addEventListener("click", whitePeace);
  ensureEl("claimsExport").addEventListener("click", exportCsv);
}

function refresh(): void {
  if (!pack.states[selected] || pack.states[selected].removed)
    selected = pack.states.find(s => s.i && !s.removed)?.i ?? 0;
  for (const button of ensureEl("claimsModes").querySelectorAll<HTMLElement>("button")) {
    button.classList.toggle("pressed", button.dataset.mode === mode);
  }
  showClaimsMap(mode, selected);
  renderFocus();
  renderLegend();
  renderTable();
}

const stateIcon = (id: number) => {
  EmblemRenderer.trigger(`stateCOA${id}`, pack.states[id].coa);
  return /* html */ `<svg class="coaIcon" viewBox="0 0 200 200"><use href="#stateCOA${id}"></use></svg>`;
};

function renderFocus(): void {
  const row = getStateClaims().find(r => r.i === selected);
  const state = pack.states[selected];
  if (!row || !state) {
    ensureEl("claimsFocus").innerHTML = "";
    return;
  }
  const fact = (value: number, label: string) =>
    value ? /* html */ `<span class="claimsFact"><b>${value}</b> <span>${label}</span></span>` : "";
  const enemies = pack.states.filter(s => s.i && !s.removed && state.diplomacy?.[s.i] === "Enemy");
  const overlord = States.getOverlord(selected);
  const subjects = pack.states.filter(s => s.i && !s.removed && States.getOverlord(s.i) === selected);
  const link = (s: { i: number; name: string }) =>
    `<span class="notranslate pointer" data-state="${s.i}">${s.name}</span>`;
  ensureEl("claimsFocus").innerHTML = /* html */ `
    <div class="claimsFocusName">${stateIcon(selected)}<span class="notranslate">${state.fullName || state.name}</span></div>
    <div>
      ${fact(row.cores, "cores held")}
      ${fact(row.nonCore, "non-core provinces")}
      ${fact(row.occupied, "occupied by enemies")}
      ${fact(row.occupying, "occupied by it")}
      ${fact(row.irredenta, "lost cores")}
      ${fact(row.claims, "claims abroad")}
      ${fact(row.claimed, "claimed by others")}
    </div>
    ${
      overlord
        ? /* html */ `<div><span>${state.subject ?? "Vassal"}</span> <span>of</span> ${link(pack.states[overlord])}</div>`
        : ""
    }
    ${
      subjects.length
        ? /* html */ `<div><span>Subjects</span>: ${subjects.map(s => `${link(s)} (<span>${s.subject ?? "Vassal"}</span>)`).join(", ")}</div>`
        : ""
    }
    ${
      enemies.length
        ? /* html */ `<div class="claimsWars"><span>At war with</span>: ${enemies
            .map(e => `<span class="notranslate pointer" data-state="${e.i}">${e.name}</span>`)
            .join(", ")}</div>`
        : ""
    }`;
  ensureEl("claimsFocus")
    .querySelectorAll<HTMLElement>("[data-state]")
    .forEach(el => {
      el.addEventListener("click", () => selectState(+el.dataset.state!));
    });
}

function renderLegend(): void {
  const item = (color: string, label: string, pattern = "") =>
    /* html */ `<span class="claimsLegendItem"><i style="background:${pattern || color}"></i><span>${label}</span></span>`;
  const stripes = (a: string, b: string) => `repeating-linear-gradient(45deg, ${a} 0 3px, ${b} 3px 7px)`;
  let html = "";
  if (mode === "focus") {
    const own = pack.states[selected]?.color ?? "#000";
    for (const [kind, { color, label }] of Object.entries(FOCUS_LEGEND)) {
      const pattern =
        kind === "held"
          ? stripes(own, color)
          : kind === "lost"
            ? stripes("#5a1010", color)
            : kind === "claimed"
              ? ""
              : "";
      html += kind === "claimed" ? item("transparent; border: 2px dashed #2e86de", label) : item(color, label, pattern);
    }
  } else if (mode === "control") {
    html =
      item("#888", "Occupied: stripes in the occupier's color", stripes("#888", "transparent")) +
      item("#c0141c", "Front line");
  } else {
    html = `${item("#ffe58a", "Little disputed")}${item("#fd8d3c", "Disputed")}${item("#bd0026", "Powder keg")}`;
  }
  ensureEl("claimsLegend").innerHTML = html;
}

function renderTable(): void {
  const rows = getStateClaims().sort((a, b) => {
    const diff = (a[sortKey] as number) - (b[sortKey] as number);
    return (sortDesc ? -diff : diff) || a.i - b.i;
  });
  const arrow = (key: string) => (key === sortKey ? (sortDesc ? " ▾" : " ▴") : "");
  const header = COLUMNS.map(c => `<th data-key="${c.key}" data-tip="${c.tip}">${c.label}${arrow(c.key)}</th>`).join(
    ""
  );
  const body = rows
    .map(row => {
      const state = pack.states[row.i];
      const cells = COLUMNS.map(c => `<td class="${row[c.key] ? "" : "zero"}">${row[c.key]}</td>`).join("");
      return /* html */ `<tr data-id="${row.i}" class="${row.i === selected ? "selected" : ""}">
        <td class="claimsName">${stateIcon(row.i)}<span class="notranslate">${state.name}</span></td>${cells}</tr>`;
    })
    .join("");
  ensureEl("claimsTable").innerHTML = /* html */ `<table>
    <thead><tr><th data-tip="Click a state to select it">State</th>${header}</tr></thead>
    <tbody>${body}</tbody></table>`;
}

function selectState(stateId: number): void {
  if (!stateId || !pack.states[stateId] || pack.states[stateId].removed) return;
  selected = stateId;
  if (mode !== "focus") mode = "focus";
  refresh();
}

function selectOnMap(this: SVGElement, event: MouseEvent): void {
  const [x, y] = getPointer(event, this);
  const cell = Pack.findCell(x, y);
  if (cell !== undefined && pack.cells.state[cell]) selectState(pack.cells.state[cell]);
}

function showProvinceTip(this: SVGElement, event: MouseEvent): void {
  const [x, y] = getPointer(event, this);
  const cell = Pack.findCell(x, y);
  const province = cell === undefined ? undefined : pack.provinces[pack.cells.province[cell]];
  if (!province?.i || province.removed) {
    clearMainTip();
    return;
  }
  const { states } = pack;
  const names = (ids?: number[]) => (ids?.length ? ids.map(id => states[id]?.name).join(", ") : translate("none"));
  const controller = cellController(cell!);
  const parts = [
    `${province.fullName || province.name} (${states[province.state]?.name})`,
    controller !== province.state ? `${translate("Occupied by")} ${states[controller]?.name}` : "",
    `${translate("Cores")}: ${names(province.cores)}`,
    `${translate("Claims")}: ${names(province.claims)}`,
    `${translate("Tension")}: ${provinceTension(province.i)}`
  ];
  tip(parts.filter(Boolean).join(" · "));
}

function redraw(lands = false): void {
  if (lands) Layers.draw("states", "borders");
  if (Layers.isOn("provinces")) Layers.draw("provinces");
  refresh();
}

function regenerateClaims(): void {
  confirmationDialog({
    title: "Generate claims",
    message:
      "Generate claims anew? Neighbors get cores where their people live, rivals and enemies claim border provinces, occupiers claim what they hold. All claims and foreign cores are replaced",
    confirm: "Generate",
    onConfirm: () => {
      const added = Provinces.generateClaims();
      tip(`${translate("Claims and cores added")}: ${added}`, true, "success", 4000);
      redraw();
    }
  });
}

function regenerateOccupation(): void {
  confirmationDialog({
    title: "Occupation from wars",
    message: "Generate occupation from the wars in the diplomacy? All occupations are replaced",
    confirm: "Generate",
    onConfirm: () => {
      const count = Provinces.generateOccupation();
      tip(`${translate("Occupied provinces")}: ${count}`, true, "success", 4000);
      redraw();
    }
  });
}

function integrateCores(): void {
  let added = 0;
  for (const province of pack.provinces) {
    if (!province?.i || province.removed || province.state !== selected || province.cores?.includes(selected)) continue;
    Provinces.setClaim(province.i, selected, "core");
    added++;
  }
  tip(`${translate("Cores added")}: ${added}`, true, "success", 3000);
  redraw();
}

function peaceConference(): void {
  const occupied = pack.provinces.filter(p => p?.i && !p.removed && p.controller === selected);
  if (!occupied.length) {
    tip("The selected state occupies no provinces", false, "warn");
    return;
  }
  confirmationDialog({
    title: "Peace conference",
    message: `${translate("The selected state annexes the provinces it occupies")}: <b class="notranslate">${occupied.length}</b>. ${translate("Their old owners keep their cores and will want them back")}`,
    confirm: "Annex",
    onConfirm: () => {
      let annexed = 0;
      for (const province of occupied) {
        try {
          Provinces.setState(province.i, selected);
          if (province.claims?.includes(selected)) Provinces.setClaim(province.i, selected, "none");
          annexed++;
        } catch {
          Provinces.setController(province.i, 0); // a capital goes back to its owner
        }
      }
      tip(`${translate("Provinces annexed")}: ${annexed}`, true, "success", 4000);
      redraw(true);
    }
  });
}

function whitePeace(): void {
  const enemies = pack.states.filter(s => s.i && !s.removed && pack.states[selected].diplomacy?.[s.i] === "Enemy");
  for (const enemy of enemies) Provinces.endOccupation(selected, enemy.i);
  for (const province of pack.provinces) {
    if (
      province?.i &&
      !province.removed &&
      (province.controller === selected || (province.state === selected && province.controller))
    )
      Provinces.setController(province.i, 0);
  }
  tip("All occupied land is given back", true, "success", 3000);
  redraw();
}

function showDisputes(): void {
  const disputes = getDisputes()
    .filter(d => d.score > 0)
    .slice(0, 25);
  const { states } = pack;
  const name = (id: number) => `<span class="notranslate">${states[id].name}</span>`;
  const reason = (value: number, label: string) => (value ? `<span><b>${value}</b> <span>${label}</span></span>` : "");
  const lines = disputes
    .map(d => {
      const relation = RELATIONS[d.relation];
      const reasons = [
        reason(d.cores, "cores"),
        reason(d.claims, "claims"),
        reason(d.occupied, "occupied"),
        relation && d.relation !== "Neutral" ? `<span style="color:${relation.color}">${d.relation}</span>` : ""
      ]
        .filter(Boolean)
        .join(" · ");
      return /* html */ `<tr data-id="${d.a}" class="pointer">
        <td class="claimsScore">${d.score}</td>
        <td>${stateIcon(d.a)}${name(d.a)}</td><td>→</td><td>${stateIcon(d.b)}${name(d.b)}</td>
        <td class="claimsReasons">${reasons}</td></tr>`;
    })
    .join("");

  ensureEl("alertMessage").innerHTML = disputes.length
    ? /* html */ `<div class="claimsDisputes"><p>The states on the left want or hold land of the states on the right. Click a line to select the state</p>
        <table><tbody>${lines}</tbody></table></div>`
    : `<p>No disputes: no claims, foreign cores, occupations or wars</p>`;
  ensureEl("alertMessage")
    .querySelectorAll<HTMLElement>("tr[data-id]")
    .forEach(row => {
      row.addEventListener("click", () => {
        $("#alert").dialog("close");
        selectState(+row.dataset.id!);
      });
    });
  $("#alert").dialog({
    title: "Hotspots",
    width: "auto",
    position: { my: "center", at: "center", of: "svg" },
    buttons: {
      Close: function (this: HTMLElement) {
        $(this).dialog("close");
      }
    }
  });
}

function exportCsv(): void {
  const header = ["Id", "State", ...COLUMNS.map(c => c.label)].join(",");
  const rows = getStateClaims().map(row =>
    [row.i, `"${pack.states[row.i].name}"`, ...COLUMNS.map(c => row[c.key])].join(",")
  );
  downloadFile([header, ...rows].join("\n"), `${getFileName("Claims")}.csv`);
}

function close(): void {
  applyDefaultViewboxEvents(); // also restores the default mousemove handler
  clearMainTip();
  removeClaimsMap();
  $(`#${dialogId}`).dialog("destroy");
  findEl(dialogId)?.remove();
}

export const ClaimsOverview = { open };
