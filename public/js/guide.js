(function () {
  var reduce =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function fitKickerSub() {
    var brand = document.querySelector(".mast .kicker-brand");
    var sub = document.querySelector(".mast .kicker-sub");
    if (!brand || !sub) return;
    sub.style.fontSize = "";
  }
  fitKickerSub();
  window.addEventListener("resize", fitKickerSub);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(fitKickerSub).catch(function () {});
  }

  var root = document.getElementById("guide");
  if (!root) return;

  var history = [];

  var nodes = {
    start: {
      kicker: "Quick guide",
      question: "What is going on?",
      lead: "Answer a few short questions. You will get who acts, who pays, and who to contact — with a link to the full rule.",
      choices: [
        { label: "Immediate danger (fire, gas, flood, structural risk)", next: "out_emergency" },
        { label: "Leak, damp or damage", next: "damage_where" },
        { label: "Something wrong in the shared parts", next: "shared_urgency" },
        { label: "Something wrong inside my apartment", next: "out_inside" },
        { label: "Pests", next: "pest_where" },
        { label: "Money, works, votes or improvements", next: "money_kind" },
        { label: "Sale of an apartment, or pets", next: "sale_or_pets" },
        { label: "Disagreement with a neighbour", next: "out_neighbour" },
        { label: "Something else / not sure", next: "out_general" }
      ]
    },

    damage_where: {
      kicker: "Leak or damage",
      question: "Where did the failure start?",
      lead: "The answer turns on the cause, not only where the water or damage shows.",
      choices: [
        { label: "Inside my apartment (pipe, appliance, fitting)", next: "damage_spread" },
        { label: "From another apartment into mine", next: "out_between" },
        { label: "From the building (roof, pointing, gutters, rising damp)", next: "out_structural" },
        { label: "In the shared parts only", next: "shared_urgency" }
      ]
    },

    damage_spread: {
      kicker: "Inside your apartment",
      question: "Has it affected another apartment or the shared parts?",
      choices: [
        { label: "No — confined to my apartment", next: "out_inside" },
        { label: "Yes — another apartment is affected", next: "out_between_source" },
        { label: "Yes — it reaches shared parts", next: "out_inside_shared" }
      ]
    },

    shared_urgency: {
      kicker: "Shared parts",
      question: "How urgent is it?",
      choices: [
        { label: "Immediate danger", next: "out_emergency" },
        { label: "Urgent — will worsen if left (leak, insecure door, displaced tile)", next: "out_shared_urgent" },
        { label: "Routine maintenance (gutters, worn surfaces, servicing)", next: "out_shared_routine" },
        { label: "An improvement or new proposal", next: "out_improvement" }
      ]
    },

    pest_where: {
      kicker: "Pests",
      question: "Where have you seen activity?",
      choices: [
        { label: "Only inside my apartment", next: "out_pest_inside" },
        { label: "Roof voids, drains, bin store, grounds or structure", next: "out_pest_shared" },
        { label: "Bats or nesting birds", next: "out_bats" }
      ]
    },

    money_kind: {
      kicker: "Money and decisions",
      question: "What do you need?",
      choices: [
        { label: "Who authorises spending from the common fund", next: "out_spend" },
        { label: "How voting works", next: "out_vote" },
        { label: "Who obtains quotes", next: "out_quotes" },
        { label: "I want to propose an improvement", next: "out_improvement" }
      ]
    },

    sale_or_pets: {
      kicker: "Sale or pets",
      question: "Which applies?",
      choices: [
        { label: "I am selling / buyer’s solicitor has questions", next: "out_sale" },
        { label: "I want to keep a pet (or a buyer does)", next: "out_pets" }
      ]
    },

    out_emergency: {
      result: true,
      question: "Act on the emergency first",
      whoActs:
        "Anyone on site. Contact 999, National Gas Emergency 0800 111 999, your water supplier, or an emergency electrician as appropriate. Isolate the supply if safe. Alert neighbours. Inform a director once immediate danger has passed.",
      whoPays: "Determined afterwards, by cause. Cost of stopping an emergency will not be questioned.",
      contact:
        "Do not delay for a director. Afterwards use a director’s emergency contacts in Section 9, or directors@cotewall-mews.ltd when practical.",
      section: { href: "/#reporting", label: "See Section 4 · Emergencies" },
      mail: true
    },

    out_inside: {
      result: true,
      question: "Inside your apartment — your responsibility",
      whoActs: "You arrange the repair.",
      whoPays: "You (the resident / owner of that apartment).",
      contact:
        "Inform a director only if the cause or consequence extends to the shared parts. For routine Society mail: directors@cotewall-mews.ltd.",
      section: { href: "/#boundary", label: "See Section 3 · Responsibility boundary" },
      mail: true
    },

    out_inside_shared: {
      result: true,
      question: "Inside start, shared consequence",
      whoActs:
        "You still arrange what is yours. Report the shared-parts impact to a director without delay, with photographs if possible.",
      whoPays: "Your apartment’s costs sit with you; shared-parts works follow society rules once reported.",
      contact: "directors@cotewall-mews.ltd, with location and photos.",
      section: { href: "/#reporting", label: "See Section 4 · Urgent matters" },
      mail: true
    },

    out_between: {
      result: true,
      question: "Damage from another apartment",
      whoActs:
        "Tell the owner of the apartment where the failure occurred, and a director, promptly — with photographs.",
      whoPays:
        "The owner of the apartment where the failure occurred. Not buildings insurance or the common fund. Payment is due when you provide a written price for putting the damage right.",
      contact: "Responsible owner + directors@cotewall-mews.ltd.",
      section: { href: "/#boundary", label: "See Section 3 · Damage between apartments" },
      mail: true
    },

    out_between_source: {
      result: true,
      question: "Your failure has affected another apartment",
      whoActs:
        "Put the cause right and engage with the affected owner. A director should be informed promptly.",
      whoPays:
        "You (owner of the apartment where the failure occurred). Pay when the affected owner provides a written price — do not wait for works to finish.",
      contact: "Affected owner + directors@cotewall-mews.ltd.",
      section: { href: "/#boundary", label: "See Section 3 · Damage between apartments" },
      mail: true
    },

    out_structural: {
      result: true,
      question: "Structural failure affecting an apartment",
      whoActs:
        "Report to a director as soon as noticed, with precise location and photographs, so cause and damage are both dealt with.",
      whoPays: "The society (common fund) — not the resident — for damage caused by structural failure (roof leaks, failed pointing, gutters, rising damp, and similar).",
      contact: "directors@cotewall-mews.ltd (or emergency contacts if urgent safety).",
      section: { href: "/#boundary", label: "See Section 3 · Structural failure" },
      mail: true
    },

    out_shared_urgent: {
      result: true,
      question: "Urgent shared-parts issue",
      whoActs:
        "Report to a director without delay, with a photograph where possible. Directors decide how to proceed and may ask for quotes.",
      whoPays: "Common fund, once arranged under society rules.",
      contact: "directors@cotewall-mews.ltd — or a director’s emergency number if email is not practical.",
      section: { href: "/#reporting", label: "See Section 4 · Urgent matters" },
      mail: true
    },

    out_shared_routine: {
      result: true,
      question: "Routine shared maintenance",
      whoActs: "Report to a director in writing. Items are logged and addressed in turn within the available budget.",
      whoPays: "Common fund.",
      contact: "directors@cotewall-mews.ltd.",
      section: { href: "/#reporting", label: "See Section 4 · Routine maintenance" },
      mail: true
    },

    out_pest_inside: {
      result: true,
      question: "Pests confined to one apartment",
      whoActs:
        "You arrange treatment (private pest controller or council service). Still report the activity to a director.",
      whoPays: "You.",
      contact: "Report to directors@cotewall-mews.ltd. Do not lay poison in shared areas.",
      section: { href: "/#pests", label: "See Section 6 · Pests" },
      mail: true
    },

    out_pest_shared: {
      result: true,
      question: "Pests in shared or structural areas",
      whoActs:
        "Report to a director. Directors arrange treatment across apartments — treating one flat alone is rarely effective.",
      whoPays: "Common fund.",
      contact: "directors@cotewall-mews.ltd. Do not lay poison in shared areas.",
      section: { href: "/#pests", label: "See Section 6 · Pests" },
      mail: true
    },

    out_bats: {
      result: true,
      question: "Bats or nesting birds",
      whoActs:
        "Leave undisturbed. Report to a director. Disturbing, blocking or destroying bats or active nests is a criminal offence. Lawful solutions take time.",
      whoPays: "Common fund, where society action is required.",
      contact: "directors@cotewall-mews.ltd immediately.",
      section: { href: "/#pests", label: "See Section 6 · Pests" },
      mail: true
    },

    out_spend: {
      result: true,
      question: "Spending from the common fund",
      whoActs:
        "Directors may authorise necessary works and routine spend up to £500 without prior consultation (reported in annual accounts). Above £500: necessary works proceed after residents are informed; discretionary works and improvements go to a residents’ vote.",
      whoPays: "Common fund (all nine households).",
      contact: "directors@cotewall-mews.ltd.",
      section: { href: "/#expenditure", label: "See Section 7 · Expenditure" },
      mail: true
    },

    out_vote: {
      result: true,
      question: "How voting works",
      whoActs:
        "Proposals circulate by email or the residents’ group with quotes and a closing date. Each apartment has one vote. Majority of votes cast decides; non-response is an abstention; ties go to the directors. Matters with legal implications or over £5,000 require a vote from every apartment.",
      whoPays: "According to the proposal (usually common fund if approved).",
      contact: "directors@cotewall-mews.ltd.",
      section: { href: "/#expenditure", label: "See Section 7 · Voting" },
      mail: true
    },

    out_quotes: {
      result: true,
      question: "Who obtains quotes",
      whoActs:
        "Three written quotes. Normally obtained by the resident who raised the matter. If several apartments are affected, directors obtain them or divide the task. If you cannot obtain quotes, tell a director.",
      whoPays: "According to the matter raised.",
      contact: "directors@cotewall-mews.ltd if you need help.",
      section: { href: "/#quotes", label: "See Section 5 · Quotes" },
      mail: true
    },

    out_improvement: {
      result: true,
      question: "Improvements and proposals",
      whoActs:
        "Submit to the directors in writing with cost and reasoning. Improvements are funded from money belonging to all nine households and go to a residents’ vote.",
      whoPays: "Common fund, if approved.",
      contact: "directors@cotewall-mews.ltd.",
      section: { href: "/#expenditure", label: "See Sections 4 and 7" },
      mail: true
    },

    out_sale: {
      result: true,
      question: "Sale and pre-contract enquiries",
      whoActs:
        "Notify directors when a sale is agreed and give the solicitor’s details. Buyer solicitors send pre-contract enquiries to the directors, who reply for the society.",
      whoPays: "Not a common-fund maintenance matter.",
      contact: "directors@cotewall-mews.ltd.",
      section: { href: "/#sale", label: "See Section 8 · Pre-contract enquiries" },
      mail: true
    },

    out_pets: {
      result: true,
      question: "Pets need prior consent",
      whoActs:
        "Directors assess suitability; the proposal goes to a residents’ vote; written conditions must be agreed before consent. Consent is case by case for a named resident, apartment and animal — not transferable.",
      whoPays: "Applicant’s own costs; society process via directors.",
      contact: "directors@cotewall-mews.ltd to start an application.",
      section: { href: "/#sale", label: "See Section 8 · Pets" },
      mail: true
    },

    out_neighbour: {
      result: true,
      question: "Disagreement with a neighbour",
      whoActs:
        "Try to resolve between yourselves first. If that fails, either party may ask the directors to assist as a neutral party. Directors suggest a way forward; they do not impose outcomes between neighbours.",
      whoPays: "Not applicable.",
      contact: "directors@cotewall-mews.ltd after you have attempted a direct conversation.",
      section: { href: "/#reporting", label: "See Section 4 · Disagreements" },
      mail: true
    },

    out_general: {
      result: true,
      question: "Start with the Directors mailbox",
      whoActs:
        "For routine Society questions use directors@cotewall-mews.ltd — it creates a record every director can see. If you are a tenant, raise non-emergency matters with your landlord first.",
      whoPays: "Depends on the matter — the handbook summary table is the fastest overview.",
      contact: "directors@cotewall-mews.ltd. Emergency personal numbers are in Section 9 for genuine emergencies only.",
      section: { href: "/#summary", label: "See Section 11 · Summary" },
      mail: true,
      extra: { href: "/#contacts", label: "See Section 9 · Contacts" }
    }
  };

  function go(id, push) {
    if (push !== false && history[history.length - 1] !== id) {
      history.push(id);
    }
    render(id);
  }

  function back() {
    if (history.length < 2) return;
    history.pop();
    render(history[history.length - 1]);
  }

  function restart() {
    history = ["start"];
    render("start");
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function render(id) {
    var node = nodes[id];
    if (!node) return;

    var html = "";
    if (node.result) {
      html += '<div class="guide-panel guide-result" role="region" aria-live="polite">';
      html += '<p class="guide-kicker">Your answer</p>';
      html += '<h2 class="guide-question">' + esc(node.question) + "</h2>";
      html += '<div class="guide-result-meta">';
      html +=
        '<div class="guide-result-row"><span class="guide-result-label">Who acts</span><p>' +
        esc(node.whoActs) +
        "</p></div>";
      html +=
        '<div class="guide-result-row"><span class="guide-result-label">Who pays</span><p>' +
        esc(node.whoPays) +
        "</p></div>";
      html +=
        '<div class="guide-result-row"><span class="guide-result-label">Who to contact</span><p>' +
        esc(node.contact) +
        "</p></div>";
      html += "</div>";
      html += '<div class="guide-actions">';
      if (node.section) {
        html +=
          '<a href="' +
          esc(node.section.href) +
          '">' +
          esc(node.section.label) +
          "</a>";
      }
      if (node.extra) {
        html +=
          '<a class="secondary" href="' +
          esc(node.extra.href) +
          '">' +
          esc(node.extra.label) +
          "</a>";
      }
      if (node.mail) {
        html +=
          '<a class="secondary" href="mailto:directors@cotewall-mews.ltd">Email the directors</a>';
      }
      html += "</div>";
      html += '<div class="guide-nav">';
      if (history.length > 1) {
        html += '<button type="button" class="guide-back" data-action="back">Back</button>';
      }
      html +=
        '<button type="button" class="guide-restart" data-action="restart">Start again</button>';
      html += "</div></div>";
    } else {
      html += '<div class="guide-panel" role="region" aria-live="polite">';
      html += '<p class="guide-kicker">' + esc(node.kicker || "Quick guide") + "</p>";
      html += '<h2 class="guide-question">' + esc(node.question) + "</h2>";
      if (node.lead) {
        html += '<p class="guide-lead">' + esc(node.lead) + "</p>";
      }
      html += '<ul class="guide-choices">';
      (node.choices || []).forEach(function (c, i) {
        html +=
          '<li><button type="button" class="guide-choice" data-next="' +
          esc(c.next) +
          '">' +
          esc(c.label) +
          "</button></li>";
      });
      html += "</ul>";
      if (history.length > 1) {
        html +=
          '<div class="guide-nav"><button type="button" class="guide-back" data-action="back">Back</button></div>';
      }
      html += "</div>";
    }

    if (!reduce) {
      root.style.opacity = "0";
      root.style.transform = "translateY(10px)";
    }
    root.innerHTML = html;
    if (!reduce) {
      window.requestAnimationFrame(function () {
        root.style.transition = "opacity .35s var(--ease), transform .35s var(--ease)";
        root.style.opacity = "1";
        root.style.transform = "none";
      });
    }

    root.querySelectorAll("[data-next]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        go(btn.getAttribute("data-next"));
      });
    });
    root.querySelectorAll('[data-action="back"]').forEach(function (btn) {
      btn.addEventListener("click", back);
    });
    root.querySelectorAll('[data-action="restart"]').forEach(function (btn) {
      btn.addEventListener("click", restart);
    });
  }

  history = ["start"];
  render("start");
})();
