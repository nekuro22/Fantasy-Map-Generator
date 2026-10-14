// Free-text lore and history of a state, region or province, written in a dialog
import { tip } from "@/components/tooltips";
import { escapeHtml } from "@/utils";
import { errorText } from "@/utils/stringUtils";

interface HistoryDialogOptions {
  title: string;
  text: string | undefined;
  onSave: (text: string) => void;
  /** with a lore text, the dialog has a second box for the description of the place */
  lore?: string;
  onSaveLore?: (text: string) => void;
}

export function historyIcon(subject: string, filled: boolean): string {
  const tipText = `Write the lore and history of ${subject}${filled ? " (has entries)" : ""}`;
  return `<span data-col="history" data-tip="${tipText}" class="icon-history pointer${filled ? "" : " inactive"}"></span>`;
}

export function openHistoryDialog({ title, text, onSave, lore, onSaveLore }: HistoryDialogOptions): void {
  $("#historyEditor").dialog("destroy").remove();
  const loreBox = onSaveLore
    ? /* html */ `<div style="margin-bottom: 4px; opacity: 0.8">Lore: what the place is like, its people, customs and secrets</div>
    <textarea id="historyEditorLore" spellcheck="true" style="width: 34em; height: 9em; resize: both">${escapeHtml(lore ?? "")}</textarea>
    <div style="margin: 8px 0 4px; opacity: 0.8">History: events by year</div>`
    : "";
  const html = /* html */ `<div id="historyEditor" class="dialog">
    ${loreBox}
    <div style="margin-bottom: 4px; opacity: 0.8">One event per line works well, e.g. <i>1268 – Revolution, the monarchy falls</i></div>
    <textarea id="historyEditorText" spellcheck="true" style="width: 34em; height: 20em; resize: both">${escapeHtml(text ?? "")}</textarea>
  </div>`;
  document.getElementById("dialogs")!.insertAdjacentHTML("beforeend", html);
  const textarea = document.getElementById("historyEditorText") as HTMLTextAreaElement;

  $("#historyEditor").dialog({
    title,
    resizable: false,
    width: "fit-content",
    position: { my: "center", at: "center", of: "svg" },
    buttons: {
      Save: function (this: HTMLElement) {
        try {
          onSaveLore?.((document.getElementById("historyEditorLore") as HTMLTextAreaElement).value);
          onSave(textarea.value);
        } catch (error) {
          tip(errorText(error), false, "error");
          return;
        }
        $(this).dialog("close");
      },
      Cancel: function (this: HTMLElement) {
        $(this).dialog("close");
      }
    },
    close: () => $("#historyEditor").dialog("destroy").remove()
  });
  (document.getElementById("historyEditorLore") ?? textarea).focus();
}
