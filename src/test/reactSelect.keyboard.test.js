/**
 * Tests for Greenhouse React-Select keyboard emulation (xapo flow).
 * Validates: Shift+Enter opens dropdown, ArrowDown+Enter selects, clear/skip on missing listbox.
 *
 * Uses jsdom to simulate the DOM from xapo.html's React-Select structure.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { JSDOM } from "jsdom";
import fs from "fs";
import path from "path";

// ─── Load utils.js and autofill.js source as text ────────────────────────────
const UTILS_PATH = path.resolve(__dirname, "../public/contentScripts/utils.js");
const AUTOFILL_PATH = path.resolve(__dirname, "../public/contentScripts/autofill.js");
const XAPO_HTML_PATH = path.resolve(__dirname, "../../examples/greenhouse/xapo.html");

const utilsSrc = fs.readFileSync(UTILS_PATH, "utf-8");
const autofillSrc = fs.readFileSync(AUTOFILL_PATH, "utf-8");

/**
 * Build a minimal React-Select DOM fragment for testing.
 * Mirrors the structure in xapo.html.
 */
function buildReactSelectHTML(fieldName, options) {
  const optionsHTML = options
    .map(
      (opt) =>
        `<div class="select__option" role="option" data-value="${opt.value}">${opt.text}</div>`
    )
    .join("\n          ");

  return `
    <div class="select__container select__control--outside-label" data-field="${fieldName}">
      <div class="select__control" role="combobox" aria-expanded="false" aria-haspopup="listbox">
        <div class="select__value-container">
          <div class="select__placeholder">Select...</div>
          <div class="select__single-value" style="display:none;"></div>
          <div class="select__input-container">
            <input id="${fieldName}" name="${fieldName}" type="text" autocomplete="off"
                   aria-label="${fieldName}" tabindex="0" role="combobox"
                   aria-autocomplete="list" aria-expanded="false" value="">
          </div>
        </div>
        <div class="select__indicators">
          <span class="select__clear-indicator" title="Clear" style="display:none;">✕</span>
          <span class="select__indicator-separator"></span>
          <span class="select__indicator select__dropdown-indicator">▾</span>
        </div>
      </div>
      <div class="select__menu" role="listbox" aria-label="${fieldName} options">
        <div class="select__menu-list">
          ${optionsHTML}
        </div>
      </div>
    </div>
  `;
}

/**
 * Attach the xapo.html React-Select simulation behavior to a container.
 * This replicates the <script> from xapo.html but for jsdom.
 */
function attachReactSelectBehavior(container, document) {
  const input = container.querySelector("input");
  const control = container.querySelector(".select__control");
  const menu = container.querySelector(".select__menu");
  const menuList = container.querySelector(".select__menu-list");
  const placeholder = container.querySelector(".select__placeholder");
  const singleValue = container.querySelector(".select__single-value");
  const clearIndicator = container.querySelector(".select__clear-indicator");
  const allOptions = Array.from(
    menuList.querySelectorAll(".select__option")
  );
  let focusedIndex = -1;
  let isOpen = false;

  function openMenu() {
    if (isOpen) return;
    isOpen = true;
    menu.classList.add("select__menu--is-open");
    control.classList.add("select__control--is-focused");
    input.setAttribute("aria-expanded", "true");
    control.setAttribute("aria-expanded", "true");
    focusedIndex = -1;
    allOptions.forEach((opt) => {
      opt.style.display = "";
      opt.classList.remove("select__option--is-focused");
    });
  }

  function closeMenu() {
    if (!isOpen) return;
    isOpen = false;
    menu.classList.remove("select__menu--is-open");
    input.setAttribute("aria-expanded", "false");
    control.setAttribute("aria-expanded", "false");
    focusedIndex = -1;
    allOptions.forEach((opt) =>
      opt.classList.remove("select__option--is-focused")
    );
  }

  function getVisibleOptions() {
    return allOptions.filter((opt) => opt.style.display !== "none");
  }

  function highlightOption(index) {
    const visible = getVisibleOptions();
    visible.forEach((opt) =>
      opt.classList.remove("select__option--is-focused")
    );
    if (index >= 0 && index < visible.length) {
      focusedIndex = index;
      visible[index].classList.add("select__option--is-focused");
    }
  }

  function selectOption(option) {
    if (!option) return;
    const text = option.textContent;
    singleValue.textContent = text;
    singleValue.style.display = "";
    placeholder.style.display = "none";
    clearIndicator.style.display = "";
    allOptions.forEach((opt) =>
      opt.classList.remove("select__option--is-selected")
    );
    option.classList.add("select__option--is-selected");
    input.value = "";
    closeMenu();
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function clearSelection() {
    singleValue.textContent = "";
    singleValue.style.display = "none";
    placeholder.style.display = "";
    clearIndicator.style.display = "none";
    allOptions.forEach((opt) =>
      opt.classList.remove("select__option--is-selected")
    );
    input.value = "";
  }

  function filterOptions(query) {
    const q = query.toLowerCase();
    allOptions.forEach((opt) => {
      const match = opt.textContent.toLowerCase().includes(q);
      opt.style.display = match ? "" : "none";
    });
    focusedIndex = -1;
    const visible = getVisibleOptions();
    if (visible.length > 0 && q.length > 0) {
      highlightOption(0);
    }
  }

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.shiftKey) {
      e.preventDefault();
      openMenu();
      return;
    }
    if (!isOpen) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const visible = getVisibleOptions();
      const next = Math.min(focusedIndex + 1, visible.length - 1);
      highlightOption(next);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      const prev = Math.max(focusedIndex - 1, 0);
      highlightOption(prev);
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const visible = getVisibleOptions();
      if (focusedIndex >= 0 && focusedIndex < visible.length) {
        selectOption(visible[focusedIndex]);
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      closeMenu();
      return;
    }
  });

  input.addEventListener("input", (e) => {
    if (isOpen) {
      filterOptions(e.target.value);
    }
  });

  clearIndicator.addEventListener("click", (e) => {
    e.stopPropagation();
    clearSelection();
  });

  // Expose state for test assertions
  container._reactSelectState = {
    isOpen: () => isOpen,
    selectedText: () => singleValue.textContent,
    focusedIndex: () => focusedIndex,
    clearSelection,
    openMenu,
    closeMenu,
  };
}

/**
 * Execute utils.js functions in a jsdom window context.
 * Returns an object with the exported functions.
 */
function loadUtilsInWindow(window) {
  // Filter out chrome-dependent parts
  const safeUtils = utilsSrc
    .replace(/const getStorageDataLocal[\s\S]*?};/g, "")
    .replace(/const getStorageDataSync[\s\S]*?};/g, "")
    .replace(/chrome\.\w+/g, "({})");

  const fn = new Function(
    "window",
    "document",
    "Event",
    "KeyboardEvent",
    "MouseEvent",
    `
    ${safeUtils}
    return {
      createShiftEnterKeyDown,
      createShiftEnterKeyUp,
      createArrowDownEvent,
      createArrowUpEvent,
      createEnterKeyDown,
      createEnterKeyUp,
      createEscapeKeyDown,
      setNativeValue,
      sleep,
      delays,
      keyDownEvent,
      keyUpEvent,
      mouseUpEvent,
      changeEvent,
      inputEvent,
    };
    `
  );

  return fn(
    window,
    window.document,
    window.Event,
    window.KeyboardEvent,
    window.MouseEvent
  );
}

/**
 * Load fillReactSelectKeyboard from autofill.js.
 * We extract just that function since the rest depends on chrome APIs.
 */
function extractFillReactSelectKeyboard(utilFns, win) {
  const fnMatch = autofillSrc.match(
    /async function fillReactSelectKeyboard\([\s\S]*?\n\}/
  );
  if (!fnMatch) throw new Error("Could not extract fillReactSelectKeyboard from autofill.js");

  const fnSrc = fnMatch[0];

  const factory = new Function(
    "createShiftEnterKeyDown",
    "createShiftEnterKeyUp",
    "createArrowDownEvent",
    "createArrowUpEvent",
    "createEnterKeyDown",
    "createEnterKeyUp",
    "createEscapeKeyDown",
    "setNativeValue",
    "sleep",
    "delays",
    "Event",
    "document",
    "console",
    `
    ${fnSrc}
    return fillReactSelectKeyboard;
    `
  );

  return factory(
    utilFns.createShiftEnterKeyDown,
    utilFns.createShiftEnterKeyUp,
    utilFns.createArrowDownEvent,
    utilFns.createArrowUpEvent,
    utilFns.createEnterKeyDown,
    utilFns.createEnterKeyUp,
    utilFns.createEscapeKeyDown,
    utilFns.setNativeValue,
    utilFns.sleep,
    utilFns.delays,
    win.Event,
    win.document,
    console
  );
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Greenhouse React-Select Keyboard Emulation (xapo)", () => {
  let dom;
  let document;
  let form;
  let utils;
  let fillReactSelectKeyboard;

  const GENDER_OPTIONS = [
    { value: "male", text: "Male" },
    { value: "female", text: "Female" },
    { value: "nonbinary", text: "Non-binary" },
    { value: "decline", text: "Decline to self-identify" },
  ];

  const RACE_OPTIONS = [
    { value: "american_indian", text: "American Indian or Alaska Native" },
    { value: "asian", text: "Asian" },
    { value: "black", text: "Black or African American" },
    { value: "hispanic", text: "Hispanic or Latino" },
    { value: "pacific_islander", text: "Native Hawaiian or Other Pacific Islander" },
    { value: "white", text: "White" },
    { value: "two_or_more", text: "Two or More Races" },
    { value: "decline", text: "Decline to self-identify" },
  ];

  const EXPERIENCE_OPTIONS = [
    { value: "0-2", text: "0-2 years" },
    { value: "3-5", text: "3-5 years" },
    { value: "6+", text: "6+ years" },
    { value: "10+", text: "10+ years" },
  ];

  beforeEach(() => {
    dom = new JSDOM(
      `<!DOCTYPE html>
      <html><body>
        <form id="application-form">
          <div class="field-group">
            <input type="text" id="first_name" name="first_name" placeholder="First Name">
          </div>
          ${buildReactSelectHTML("gender", GENDER_OPTIONS)}
          ${buildReactSelectHTML("race", RACE_OPTIONS)}
          ${buildReactSelectHTML("years_of_experience", EXPERIENCE_OPTIONS)}
        </form>
      </body></html>`,
      { url: "https://boards.greenhouse.io/xapo/jobs/123", pretendToBeVisual: true }
    );

    document = dom.window.document;
    form = document.getElementById("application-form");

    // Attach React-Select behavior to each container
    document.querySelectorAll(".select__container").forEach((c) => {
      attachReactSelectBehavior(c, document);
    });

    // Load utils
    utils = loadUtilsInWindow(dom.window);

    // Load fillReactSelectKeyboard
    fillReactSelectKeyboard = extractFillReactSelectKeyboard(utils, dom.window);
  });

  // ── 1-2: Shift+Enter opens dropdown ──────────────────────────────────────

  describe("Shift+Enter opens dropdown", () => {
    it("should open the gender dropdown on Shift+Enter", () => {
      const container = document.querySelector('[data-field="gender"]');
      const input = container.querySelector("input");
      const menu = container.querySelector(".select__menu");

      expect(menu.classList.contains("select__menu--is-open")).toBe(false);

      input.focus();
      input.dispatchEvent(utils.createShiftEnterKeyDown());

      expect(menu.classList.contains("select__menu--is-open")).toBe(true);
      expect(input.getAttribute("aria-expanded")).toBe("true");
    });

    it("should open the race dropdown on Shift+Enter", () => {
      const container = document.querySelector('[data-field="race"]');
      const input = container.querySelector("input");
      const menu = container.querySelector(".select__menu");

      expect(menu.classList.contains("select__menu--is-open")).toBe(false);

      input.focus();
      input.dispatchEvent(utils.createShiftEnterKeyDown());

      expect(menu.classList.contains("select__menu--is-open")).toBe(true);
    });
  });

  // ── 3-7: ArrowDown + Enter selects option ────────────────────────────────

  describe("ArrowDown + Enter selects option", () => {
    it("should select 'Male' with 1 ArrowDown + Enter", () => {
      const container = document.querySelector('[data-field="gender"]');
      const input = container.querySelector("input");

      input.focus();
      input.dispatchEvent(utils.createShiftEnterKeyDown());
      input.dispatchEvent(utils.createArrowDownEvent());
      input.dispatchEvent(utils.createEnterKeyDown());

      const singleValue = container.querySelector(".select__single-value");
      expect(singleValue.textContent).toBe("Male");
      expect(singleValue.style.display).not.toBe("none");
    });

    it("should select 'Female' with 2 ArrowDown + Enter", () => {
      const container = document.querySelector('[data-field="gender"]');
      const input = container.querySelector("input");

      input.focus();
      input.dispatchEvent(utils.createShiftEnterKeyDown());
      input.dispatchEvent(utils.createArrowDownEvent());
      input.dispatchEvent(utils.createArrowDownEvent());
      input.dispatchEvent(utils.createEnterKeyDown());

      const singleValue = container.querySelector(".select__single-value");
      expect(singleValue.textContent).toBe("Female");
    });

    it("should select 'Decline to self-identify' with 4 ArrowDown + Enter", () => {
      const container = document.querySelector('[data-field="gender"]');
      const input = container.querySelector("input");

      input.focus();
      input.dispatchEvent(utils.createShiftEnterKeyDown());

      for (let i = 0; i < 4; i++) {
        input.dispatchEvent(utils.createArrowDownEvent());
      }
      input.dispatchEvent(utils.createEnterKeyDown());

      const singleValue = container.querySelector(".select__single-value");
      expect(singleValue.textContent).toBe("Decline to self-identify");
    });

    it("should select 'Asian' from race dropdown (index 1)", () => {
      const container = document.querySelector('[data-field="race"]');
      const input = container.querySelector("input");

      input.focus();
      input.dispatchEvent(utils.createShiftEnterKeyDown());
      input.dispatchEvent(utils.createArrowDownEvent());
      input.dispatchEvent(utils.createArrowDownEvent());
      input.dispatchEvent(utils.createEnterKeyDown());

      const singleValue = container.querySelector(".select__single-value");
      expect(singleValue.textContent).toBe("Asian");
    });

    it("should select 'White' from race dropdown (index 5)", () => {
      const container = document.querySelector('[data-field="race"]');
      const input = container.querySelector("input");

      input.focus();
      input.dispatchEvent(utils.createShiftEnterKeyDown());

      for (let i = 0; i < 6; i++) {
        input.dispatchEvent(utils.createArrowDownEvent());
      }
      input.dispatchEvent(utils.createEnterKeyDown());

      const singleValue = container.querySelector(".select__single-value");
      expect(singleValue.textContent).toBe("White");
    });
  });

  // ── 8: Escape closes without selecting ───────────────────────────────────

  describe("Escape closes without selecting", () => {
    it("should close dropdown on Escape without selecting", () => {
      const container = document.querySelector('[data-field="gender"]');
      const input = container.querySelector("input");
      const menu = container.querySelector(".select__menu");

      input.focus();
      input.dispatchEvent(utils.createShiftEnterKeyDown());
      expect(menu.classList.contains("select__menu--is-open")).toBe(true);

      input.dispatchEvent(utils.createEscapeKeyDown());
      expect(menu.classList.contains("select__menu--is-open")).toBe(false);

      const singleValue = container.querySelector(".select__single-value");
      expect(singleValue.style.display).toBe("none");
    });
  });

  // ── 9: Clear selection ───────────────────────────────────────────────────

  describe("Clear selection", () => {
    it("should clear a selected value", () => {
      const container = document.querySelector('[data-field="gender"]');
      const input = container.querySelector("input");
      const clearBtn = container.querySelector(".select__clear-indicator");

      input.focus();
      input.dispatchEvent(utils.createShiftEnterKeyDown());
      input.dispatchEvent(utils.createArrowDownEvent());
      input.dispatchEvent(utils.createEnterKeyDown());

      const singleValue = container.querySelector(".select__single-value");
      expect(singleValue.textContent).toBe("Male");

      clearBtn.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));

      expect(singleValue.textContent).toBe("");
      expect(singleValue.style.display).toBe("none");
    });
  });

  // ── 10-14: fillReactSelectKeyboard integration ───────────────────────────

  describe("fillReactSelectKeyboard integration", () => {
    it("should select 'Female' via fillReactSelectKeyboard", async () => {
      const container = document.querySelector('[data-field="gender"]');
      const input = container.querySelector("input");

      await fillReactSelectKeyboard(input, container, "Female", false);

      const singleValue = container.querySelector(".select__single-value");
      expect(singleValue.textContent).toBe("Female");
    });

    it("should select 'Hispanic or Latino' via fillReactSelectKeyboard", async () => {
      const container = document.querySelector('[data-field="race"]');
      const input = container.querySelector("input");

      await fillReactSelectKeyboard(input, container, "Hispanic or Latino", false);

      const singleValue = container.querySelector(".select__single-value");
      expect(singleValue.textContent).toBe("Hispanic or Latino");
    });

    it("should select 'Non-binary' via partial match", async () => {
      const container = document.querySelector('[data-field="gender"]');
      const input = container.querySelector("input");

      await fillReactSelectKeyboard(input, container, "Non-binary", false);

      const singleValue = container.querySelector(".select__single-value");
      expect(singleValue.textContent).toBe("Non-binary");
    });

    it("should select '6+ years' from experience dropdown (xapo key test)", async () => {
      const container = document.querySelector('[data-field="years_of_experience"]');
      const input = container.querySelector("input");

      await fillReactSelectKeyboard(input, container, "6+ years", false);

      const singleValue = container.querySelector(".select__single-value");
      expect(singleValue.textContent).toBe("6+ years");
      console.log('React-Select keyboard select \'6+ years\'');
    });

    it("should handle no listbox gracefully (skip without error)", async () => {
      // Create a React-Select container WITHOUT the simulation behavior
      const orphanHTML = buildReactSelectHTML("orphan", [
        { value: "a", text: "Alpha" },
      ]);
      const wrapper = document.createElement("div");
      wrapper.innerHTML = orphanHTML;
      document.body.appendChild(wrapper);

      const container = wrapper.querySelector(".select__container");
      const input = container.querySelector("input");

      // Should not throw — times out and skips
      await expect(
        fillReactSelectKeyboard(input, container, "Alpha", false)
      ).resolves.toBeUndefined();

      const singleValue = container.querySelector(".select__single-value");
      expect(singleValue.style.display).toBe("none");
    }, 10000);
  });

  // ── 15-17: xapo.html example file validation ────────────────────────────

  describe("xapo.html example file exists and is valid", () => {
    it("should have the xapo.html example file", () => {
      expect(fs.existsSync(XAPO_HTML_PATH)).toBe(true);
    });

    it("xapo.html should contain React-Select containers", () => {
      const html = fs.readFileSync(XAPO_HTML_PATH, "utf-8");
      expect(html).toContain("select__control--outside-label");
      expect(html).toContain("select__menu");
      expect(html).toContain('role="listbox"');
      expect(html).toContain("Shift+Enter");
    });

    it("xapo.html should have gender, race, veteran, disability selects", () => {
      const html = fs.readFileSync(XAPO_HTML_PATH, "utf-8");
      expect(html).toContain('data-field="gender"');
      expect(html).toContain('data-field="race"');
      expect(html).toContain('data-field="veteran_status"');
      expect(html).toContain('data-field="disability"');
    });
  });

  // ── 18-21: utils.js keyboard event factories ────────────────────────────

  describe("utils.js keyboard event factories", () => {
    it("createShiftEnterKeyDown returns a KeyboardEvent with shiftKey=true", () => {
      const evt = utils.createShiftEnterKeyDown();
      expect(evt.constructor.name).toBe("KeyboardEvent");
      expect(evt.key).toBe("Enter");
      expect(evt.shiftKey).toBe(true);
      expect(evt.type).toBe("keydown");
    });

    it("createArrowDownEvent returns ArrowDown keydown", () => {
      const evt = utils.createArrowDownEvent();
      expect(evt.constructor.name).toBe("KeyboardEvent");
      expect(evt.key).toBe("ArrowDown");
      expect(evt.type).toBe("keydown");
      expect(evt.keyCode).toBe(40);
    });

    it("createEnterKeyDown returns Enter keydown without shift", () => {
      const evt = utils.createEnterKeyDown();
      expect(evt.constructor.name).toBe("KeyboardEvent");
      expect(evt.key).toBe("Enter");
      expect(evt.shiftKey).toBe(false);
      expect(evt.type).toBe("keydown");
    });

    it("createEscapeKeyDown returns Escape keydown", () => {
      const evt = utils.createEscapeKeyDown();
      expect(evt.constructor.name).toBe("KeyboardEvent");
      expect(evt.key).toBe("Escape");
      expect(evt.keyCode).toBe(27);
    });

    it("each factory returns a fresh event (not reused)", () => {
      const a = utils.createArrowDownEvent();
      const b = utils.createArrowDownEvent();
      expect(a).not.toBe(b);
    });
  });
});
