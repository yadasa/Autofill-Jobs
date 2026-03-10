/*
import {
  keyDownEvent,
  keyUpEvent,
  mouseUpEvent,
  changeEvent,
  inputEvent,
  sleep,
  curDateStr,
  scrollToTop,
  base64ToArrayBuffer,
  monthToNumber,
  getTimeElapsed,
  delays,
  getStorageDataLocal,
  getStorageDataSync,
  setNativeValue,
  fields
} from "./utils";
import { workDayAutofill } from './workday';
*/

let initTime;
window.addEventListener("load", (_) => {
  console.log("AutofillJobs: found job page.");
  initTime = new Date().getTime();
  awaitForm();
});
const applicationFormQuery = "#application-form, #application_form, #applicationform";


function inputQuery(jobParam, form) {
  let normalizedParam = jobParam.toLowerCase();
  let inputElement = Array.from(form.querySelectorAll("input")).find(
    (input) => {
      const attributes = [
        input.id?.toLowerCase().trim(),
        input.name?.toLowerCase().trim(),
        input.placeholder?.toLowerCase().trim(),
        input.getAttribute("aria-label")?.toLowerCase().trim(),
        input.getAttribute("aria-labelledby")?.toLowerCase().trim(),
        input.getAttribute("aria-describedby")?.toLowerCase().trim(),
        input.getAttribute("data-qa")?.toLowerCase().trim(),
      ];

      for (let i = 0; i < attributes.length; i++) {
        if (
          attributes[i] != undefined &&
          attributes[i].includes(normalizedParam)
        ) {
          return true;
        }
      }
      return false;
    }
  );
  return inputElement;
}

function formatCityStateCountry(data, param) {
  let formattedStr = `${data[param] != undefined ? `${data[param]},` : ""} ${
    data["Location (State/Region)"] != undefined
      ? `${data["Location (State/Region)"]},`
      : ""
  }`;
  if (formattedStr[formattedStr.length - 1] == ",")
    formattedStr = formattedStr.slice(0, formattedStr.length - 1);
  return formattedStr;
}

async function awaitForm() {
  // Create a MutationObserver to detect changes in the DOM
  const observer = new MutationObserver((_, observer) => {
    for (let jobForm in fields) {
      if (!window.location.hostname.includes(jobForm)) continue;
      //workday
      if (jobForm == "workday") {
        autofill(null);
        observer.disconnect();
        return;
      }
      let form = document.querySelector(applicationFormQuery);
      if (form) {
        observer.disconnect();
        autofill(form);
        return;
      } else {
        form = document.querySelector("form, #mainContent");
        if (form) {
          observer.disconnect();
          autofill(form);
          return;
        }
      }
    }
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
  if (window.location.hostname.includes("lever")) {
    let form = document.querySelector("#application-form, #application_form");
    if (form) autofill(form);
  }
}

/**
 * Fill a Greenhouse React-Select dropdown using pure keyboard emulation.
 * Flow: Focus input → Shift+Enter (open) → type value → poll for listbox →
 *       find best option → ArrowDown to it → Enter to select → verify.
 * Falls back cleanly (clears input, skips) if listbox never appears.
 *
 * @param {HTMLInputElement} inputElement - The input inside the React-Select
 * @param {HTMLElement} container - The .select__control--outside-label wrapper
 * @param {string} value - The desired option text to match
 * @param {boolean} useLongDelay - Whether to use longer delays (e.g., Location)
 */
async function fillReactSelectKeyboard(inputElement, container, value, useLongDelay) {
  const TAG = "SmartApply:ReactSelect";

  // Step 1: Focus the input
  inputElement.focus();
  await sleep(50);

  // Step 2: Dispatch Shift+Enter to open the dropdown
  inputElement.dispatchEvent(createShiftEnterKeyDown());
  inputElement.dispatchEvent(createShiftEnterKeyUp());
  console.log(`${TAG}: Dispatched Shift+Enter to open dropdown`);

  // Step 3: Type the value into the input to filter options
  setNativeValue(inputElement, value);
  await sleep(useLongDelay ? delays.long : delays.short);

  // Step 4: Poll for the listbox to appear (max ~1.5s)
  let listbox = null;
  const maxWait = 1500;
  const pollInterval = 100;
  let waited = 0;

  while (waited < maxWait) {
    // Look for listbox within the container first, then globally
    listbox = container.querySelector('[role="listbox"]')
      || container.querySelector('.select__menu--is-open .select__menu-list')
      || container.querySelector('.select__menu-list');

    // Check if the menu is actually visible/open
    const menu = container.querySelector('.select__menu');
    const menuIsVisible = menu && (
      menu.classList.contains('select__menu--is-open') ||
      menu.style.display !== 'none' && menu.offsetHeight > 0
    );
    if (listbox && menuIsVisible) {
      break;
    }

    // Also check if a global/portal listbox appeared
    if (!listbox) {
      listbox = document.querySelector('[role="listbox"]');
      if (listbox && (listbox.style.display !== 'none' && listbox.offsetParent !== null || listbox.offsetHeight > 0)) break;
      listbox = null;
    }

    await sleep(pollInterval);
    waited += pollInterval;
  }

  if (!listbox) {
    // Fallback: No listbox appeared — clear input and skip
    console.warn(`${TAG}: No listbox appeared after ${maxWait}ms, skipping field`);
    inputElement.value = '';
    inputElement.dispatchEvent(new Event('input', { bubbles: true }));
    inputElement.dispatchEvent(createEscapeKeyDown());
    return;
  }

  console.log(`${TAG}: Listbox found after ${waited}ms`);

  // Step 5: Extract visible options, find best match
  const options = Array.from(listbox.querySelectorAll('.select__option, [role="option"]'))
    .filter(opt => opt.style.display !== 'none');

  if (options.length === 0) {
    console.warn(`${TAG}: No visible options in listbox, skipping`);
    inputElement.value = '';
    inputElement.dispatchEvent(new Event('input', { bubbles: true }));
    inputElement.dispatchEvent(createEscapeKeyDown());
    return;
  }

  // Find best matching option (case-insensitive, prefers exact > includes > first)
  const valueLower = value.toLowerCase().trim();
  let bestIndex = 0; // Default to first visible option

  for (let i = 0; i < options.length; i++) {
    const optText = options[i].textContent.toLowerCase().trim();
    if (optText === valueLower) {
      bestIndex = i;
      break; // Exact match
    }
    if (optText.includes(valueLower) || valueLower.includes(optText)) {
      bestIndex = i;
      // Don't break — keep looking for exact match
    }
  }

  console.log(`${TAG}: Best match at index ${bestIndex}: "${options[bestIndex].textContent.trim()}"`);

  // Step 6: ArrowDown to the best option
  // First ArrowDown focuses option 0, second focuses option 1, etc.
  for (let i = 0; i <= bestIndex; i++) {
    inputElement.dispatchEvent(createArrowDownEvent());
    await sleep(30); // Small delay between arrow presses
  }

  console.log(`${TAG}: Navigated to option ${bestIndex} with ${bestIndex + 1} ArrowDown presses`);
  await sleep(50);

  // Step 7: Press Enter to select the focused option
  inputElement.dispatchEvent(createEnterKeyDown());
  inputElement.dispatchEvent(createEnterKeyUp());
  console.log(`${TAG}: Dispatched Enter to select option`);

  await sleep(delays.short);

  // Step 8: Verify selection via .select__single-value
  const singleValue = container.querySelector('.select__single-value');
  if (singleValue && singleValue.textContent.trim()) {
    console.log(`${TAG}: ✓ Verified selection: "${singleValue.textContent.trim()}"`);
  } else {
    console.warn(`${TAG}: Could not verify selection for "${value}"`);
  }
}

async function autofill(form) {
  console.log("Autofill Jobs: Starting autofill.");
  let res = await getStorageDataSync();
  res["Current Date"] = curDateStr();
  await sleep(delays.initial);
  for (let jobForm in fields) {
    if (!window.location.hostname.includes(jobForm)) continue;
    if (jobForm == "workday") {
      workDayAutofill(res);
      return;
    }

    for (let jobParam in fields[jobForm]) {
      if (jobParam.toLowerCase() == "resume") {
          let localData = await getStorageDataLocal();
          if (!localData.Resume) continue;

          let resumeDiv = {
            greenhouse: 'input[id="resume"]',
            lever: 'input[id="resume-upload-input"]',
            dover:
              'input[type="file"][accept=".pdf"], input[type="file"][accept="application/pdf"]',
          };
          let el = document.querySelector(resumeDiv[jobForm]);
          if (!el) {
            //old greenhouse forms
            el = document.querySelector('input[type="file"]');
          }
          el.addEventListener("submit", function (event) {
            event.preventDefault();
          });
          
          const dt = new DataTransfer();
          let arrBfr = base64ToArrayBuffer(localData.Resume);

          dt.items.add(
            new File([arrBfr], `${localData["Resume_name"]}`, {
              type: "application/pdf",
            })
          );
          el.files = dt.files;
          el.dispatchEvent(changeEvent);
          await sleep(delays.short);
          
        
        continue;
      }

      let useLongDelay = false;
      //gets param from user data
      const param = fields[jobForm][jobParam];
      let fillValue = res[param];
      if (!fillValue) continue;
      let inputElement = inputQuery(jobParam, form);
      if (!inputElement) continue;

      if (param === "Gender" || param === "Location (City)") useLongDelay = true;
      if (param === "Location (City)")  fillValue = formatCityStateCountry(res, param);

      // Check if this input lives inside a React-Select container
      let reactSelectContainer = inputElement.closest(".select__control--outside-label");
      if (reactSelectContainer) {
        // ── React-Select: Pure keyboard emulation (Shift+Enter → type → ArrowDown → Enter) ──
        console.log(`SmartApply: React-Select keyboard flow for [${jobParam}] with value "${fillValue}"`);
        await fillReactSelectKeyboard(inputElement, reactSelectContainer, fillValue, useLongDelay);
      } else {
        // Plain input — just set value
        setNativeValue(inputElement, fillValue);
      }
    }
    scrollToTop();
    console.log(`Autofill Jobs: Complete in ${getTimeElapsed(initTime)}s.`);
    break; //found site
  }
  
}

