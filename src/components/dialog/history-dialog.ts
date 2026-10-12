// Free-text history of a state or province, written in a dialog
import { tip } from "@/components/tooltips";
import { escapeHtml } from "@/utils";
import { errorText } from "@/utils/stringUtils";

interface HistoryDialogOptions {
  title: string;
  text: string | undefined;
  onSave: (text: string) => void;
}

export function historyIcon(subject: string, filled: boolean): string {
  const tipText = `Write the history of ${subject}${filled ? " (has entries)" : ""}`;
  return `<span data-col="history" data-tip="${tipText}" class="icon-history pointer${filled ? "" : " inactive"}"></span>`;
}

export function openHistoryDialog({ title, text, onSave }: HistoryDialogOptions): void {
  $("#historyEditor").dialog("destroy").remove();
  const html = /* html */ `<div id="historyEditor" class="dialog">
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
  textarea.focus();
}
