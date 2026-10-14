// The World History dialog: save the world as a dated version, read how it changed from version to version,
// and go back to an earlier one. Versions live in the browser's storage, dated by the map's calendar
import { confirmationDialog } from "@/components/dialog/dialog-helpers";
import { tip } from "@/components/tooltips";
import { Lore } from "@/generators/lore";
import { type Change, diffWorlds, territoryTable, type WorldVersion } from "@/generators/world-history";
import { translate } from "@/services/i18n";
import { Load } from "@/services/io/load";
import { listVersions, removeVersion, saveVersion, versionMap } from "@/services/world-history-store";
import { errorText } from "@/utils/stringUtils";
import { ensureEl, escapeHtml } from "../utils";

const DIALOG_ID = "worldHistory";

const name = (value: string) => `<b class="notranslate">${escapeHtml(value)}</b>`;
const plural = (text: string, count: number) => `${translate(text.replace("{n}", String(count)))}`;

/** One change as a sentence: names stay as they are, the words around them are translated */
function describe(change: Change): string {
  const { state, other, count = 0, provinces = [] } = change;
  const places = `title="${escapeHtml(provinces.join(", "))}"`;
  switch (change.kind) {
    case "founded":
      return `${name(state)} ${translate("was founded")}`;
    case "gone":
      return `${name(state)} ${translate("no longer exists")}`;
    case "renamed":
      return `${name(other!)} ${translate("was renamed")} ${name(state)}`;
    case "form":
      return `${name(state)} ${translate("changed its form of government to")} ${name(other!)}`;
    case "capital":
      return `${name(state)} ${translate("moved its capital to")} ${name(other!)}`;
    case "gained":
      return `${name(state)} <span ${places}>${plural("gained {n} province(s) from", count)}</span> ${name(other!)}`;
    case "occupied":
      return `${name(state)} <span ${places}>${plural("occupied {n} province(s) of", count)}</span> ${name(other!)}`;
    case "liberated":
      return `${name(state)} <span ${places}>${plural("regained {n} occupied province(s) from", count)}</span> ${name(other!)}`;
    case "war":
      return `${name(state)} ${translate("and")} ${name(other!)} ${translate("went to war")}`;
    case "peace":
      return `${name(state)} ${translate("and")} ${name(other!)} ${translate("made peace")}`;
    default:
      return "";
  }
}

const SHOWN = new Set([
  "founded",
  "gone",
  "renamed",
  "form",
  "capital",
  "gained",
  "occupied",
  "liberated",
  "war",
  "peace"
]);

function timelineHtml(versions: WorldVersion[]): string {
  if (!versions.length) return `<p><i>${translate("No versions yet. Save the world to start its history")}</i></p>`;
  return versions
    .map((version, index) => {
      const changes = index
        ? diffWorlds(versions[index - 1].summary, version.summary).filter(c => SHOWN.has(c.kind))
        : [];
      const list = index
        ? changes.length
          ? `<ul style="margin: 2px 0 0 1.2em; padding: 0">${changes.map(c => `<li>${describe(c)}</li>`).join("")}</ul>`
          : `<div style="opacity: .7">${translate("Nothing changed")}</div>`
        : `<div style="opacity: .7">${translate("The first version")}</div>`;
      return /* html */ `<div class="whVersion" data-id="${version.id}" style="padding: 4px 0; border-top: 1px solid #8884">
        <div style="display: flex; gap: .5em; align-items: baseline">
          <b>${escapeHtml(version.era)} ${version.year}</b>
          <span class="notranslate" style="flex: 1">${escapeHtml(version.title)}</span>
          <button class="whLoad" data-tip="Go back to this version of the world. The map now open is replaced">Load</button>
          <span class="icon-trash-empty pointer whRemove" data-tip="Delete this version"></span>
        </div>
        ${version.note ? `<div class="notranslate" style="opacity: .85">${escapeHtml(version.note)}</div>` : ""}
        ${list}
      </div>`;
    })
    .join("");
}

function territoryHtml(versions: WorldVersion[]): string {
  if (versions.length < 2) return "";
  const head = versions.map(v => `<th>${escapeHtml(v.era)} ${v.year}</th>`).join("");
  const rows = territoryTable(versions)
    .map(
      row =>
        `<tr><td class="notranslate">${escapeHtml(row.name)}</td>${row.counts
          .map(c => `<td style="text-align: right">${c === null ? "–" : c}</td>`)
          .join("")}</tr>`
    )
    .join("");
  return /* html */ `<div style="margin-top: .6em"><b>${translate("Provinces per state")}</b>
    <div style="max-height: 11em; overflow: auto"><table style="border-collapse: collapse; width: 100%">
      <tr><th></th>${head}</tr>${rows}</table></div></div>`;
}

async function render(): Promise<void> {
  const { calendar } = options.map.lore;
  const versions = await listVersions();
  ensureEl("worldHistoryBody").innerHTML = /* html */ `
    <div style="display: grid; grid-template-columns: auto 1fr; gap: .3em .5em; align-items: center">
      <span>${translate("Now")}:</span>
      <span><b>${escapeHtml(calendar.eraShort || calendar.era)} ${calendar.year}</b>
        <span style="opacity: .7">(${translate("the calendar is set in the Lore Editor")})</span></span>
      <label for="whTitle">${translate("Title")}:</label>
      <input id="whTitle" class="notranslate" placeholder="${translate("e.g. After the Great War")}" data-tip="Name of this version" />
      <label for="whNote">${translate("Note")}:</label>
      <input id="whNote" class="notranslate" data-tip="What happened since the last version, for your own reference" />
      <label for="whAdvance">${translate("Then advance")}:</label>
      <span><input id="whAdvance" type="number" value="0" step="1" style="width: 5em" data-tip="Years the calendar moves forward after saving, so the next version is later" /> ${translate("years")}</span>
    </div>
    <div style="margin: .5em 0"><button id="whSave" data-tip="Save the world as it is now as a new version at the current year">${translate("Save this version")}</button></div>
    <div id="whTimeline" style="max-height: 20em; overflow-y: auto">${timelineHtml(versions)}</div>
    ${territoryHtml(versions)}`;
  ensureEl("whSave").onclick = save;
  ensureEl("whTimeline").onclick = event => {
    const el = event.target as HTMLElement;
    const id = el.closest<HTMLElement>(".whVersion")?.dataset.id;
    if (!id) return;
    if (el.classList.contains("whLoad")) restore(id);
    if (el.classList.contains("whRemove")) remove(id);
  };
}

async function save(): Promise<void> {
  try {
    const title = ensureEl<HTMLInputElement>("whTitle").value;
    const note = ensureEl<HTMLInputElement>("whNote").value;
    const advance = Math.round(+ensureEl<HTMLInputElement>("whAdvance").value || 0);
    const version = await saveVersion(title, note);
    if (advance) Lore.setYear(options.map.lore.calendar.year + advance);
    tip(`${translate("Version saved")}: ${version.era} ${version.year}`, true, "success", 3000);
    await render();
  } catch (error) {
    tip(errorText(error), false, "error");
  }
}

function restore(id: string): void {
  confirmationDialog({
    title: "Load version",
    message: "Replace the map now open with this version? Unsaved changes are lost. Your other versions stay",
    confirm: "Load",
    onConfirm: async () => {
      const blob = await versionMap(id);
      if (!blob) return tip("This version is not stored any more", false, "error");
      $(`#${DIALOG_ID}`).dialog("close");
      Load.uploadMap(blob);
    }
  });
}

function remove(id: string): void {
  confirmationDialog({
    title: "Delete version",
    message: "Delete this saved version of the world? The map now open is not touched",
    confirm: "Delete",
    onConfirm: async () => {
      await removeVersion(id);
      await render();
    }
  });
}

function open(): void {
  $(`#${DIALOG_ID}`).dialog("destroy").remove();
  ensureEl("dialogs").insertAdjacentHTML(
    "beforeend",
    `<div id="${DIALOG_ID}" class="dialog"><div id="worldHistoryBody" style="width: 36em"></div></div>`
  );
  $(`#${DIALOG_ID}`).dialog({
    title: translate("World history"),
    resizable: true,
    width: "fit-content",
    position: { my: "center", at: "center", of: "svg" },
    close: () => $(`#${DIALOG_ID}`).dialog("destroy").remove()
  });
  void render();
}

export const WorldHistory = { open };
