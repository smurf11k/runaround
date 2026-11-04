      /* ═══════════════════════════════════════════════════════════════════
   PALETTE & LABELS — the six structural branches keep their own fixed
   colours (used for the threads and the group labels); the three
   grouping modes each get a consistent palette for the little dots.
   ═══════════════════════════════════════════════════════════════════ */
      const palette = {
        root: "#e8eef5",
        motion: "#f2b36f",
        figure: "#8fc8ee",
        control: "#d99be8",
        flow: "#7ed4bd",
        extent: "#b9b1ff",
        idiom: "#f08f9d",
      };
      const labels = {
        motion: "Literal motion",
        figure: "Figurative motion",
        control: "Operation & control",
        flow: "Flow & spread",
        extent: "Extent & duration",
        idiom: "Idioms & phrasal verbs",
      };

      const modes = {
        word: {
          label: "Word class",
          key: "cls",
          colors: {
            verb: "#8fc8ee",
            noun: "#7ed4bd",
            adjective: "#b9b1ff",
            adverb: "#f2b36f",
            idiom: "#f08f9d",
          },
        },
        use: {
          label: "Type of use",
          key: "use",
          colors: {
            literal: "#f2b36f",
            metaphorical: "#8fc8ee",
            metonymic: "#d99be8",
          },
        },
        form: {
          label: "Detailed form",
          key: "form",
          colors: {
            "simple verb": "#8fc8ee",
            "phrasal verb": "#5d9fcd",
            "noun – countable": "#7ed4bd",
            "noun – uncountable": "#a9e4d5",
            "noun – plural": "#4fae97",
            adjective: "#b9b1ff",
            adverb: "#f2b36f",
            idiom: "#f08f9d",
          },
        },
      };

      /* ═══════════════════════════════════════════════════════════════════
   SETUP
   ═══════════════════════════════════════════════════════════════════ */
      const svg = d3.select("#chart");
      const scene = svg.append("g");
      const edges = scene.append("g");
      const nodesLayer = scene.append("g");

      let hintDismissed = false;
      function dismissHint() {
        if (hintDismissed) return;
        hintDismissed = true;
        document.getElementById("emptyHint").classList.add("gone");
      }
      /* the info button brings the hint back, and it stays until the
         canvas (or a node) is moved again */
      function restoreHint() {
        hintDismissed = false;
        document.getElementById("emptyHint").classList.remove("gone");
      }
      document.getElementById("hintBtn").addEventListener("click", restoreHint);

      const zoom = d3
        .zoom()
        .scaleExtent([0.25, 2.6])
        .on("zoom", (e) => {
          scene.attr("transform", e.transform);
          if (e.sourceEvent) dismissHint();
        });
      svg.call(zoom).on("dblclick.zoom", null);

      const box0 = document.getElementById("workspace").getBoundingClientRect();
      let W = box0.width,
        H = box0.height;

      /* ---- view state ----
         activeCat     : the legend filter. It is sticky — it stays on until
                         the same legend entry is clicked again (or reset).
         selectedGroup : the structural group (coloured thread family) that
                         the user clicked on. The two must never run together:
                         switching to the legend filter drops the group
                         spotlight for good, so turning the filter off lands
                         in the plain, unhighlighted state. */
      let mode = "word";
      let activeCat = null;
      let selectedGroup = null;
      let searchTerm = "";
      let selected = null;
      let gatherCenter = null;

      /* radii of the two rings; refreshed on resize */
      let rCat = 210,
        rLeaf = 370,
        rStagger = 46;

      /* ═══════════════════════════════════════════════════════════════════
   HIERARCHY PREP
   ═══════════════════════════════════════════════════════════════════ */
      const rootData = d3.hierarchy(data);
      const allNodes = rootData.descendants();
      const flat = allNodes.map((d, i) => ({
        id: i,
        data: d.data,
        depth: d.depth,
        parentId: d.parent ? allNodes.indexOf(d.parent) : null,
        cat: d.data.cat || null,
        cls: d.data.cls || null,
        use: d.data.use || null,
        form: d.data.form || null,
      }));
      const byId = new Map(flat.map((d) => [d.id, d]));
      const links = rootData.links().map((l) => ({
        source: allNodes.indexOf(l.source),
        target: allNodes.indexOf(l.target),
      }));
      const categoryNodes = flat.filter((d) => d.data.type === "category");
      const leafNodes = flat.filter((d) => d.depth === 2);
      const categoryOrder = categoryNodes.map((d) => d.cat);
      const rootNode = flat.find((d) => d.depth === 0);

      /* leaves grouped per structural branch, with their index inside it */
      const leavesByCat = new Map();
      categoryOrder.forEach((c) =>
        leavesByCat.set(
          c,
          leafNodes.filter((n) => n.cat === c),
        ),
      );
      leafNodes.forEach((n) => {
        const sib = leavesByCat.get(n.cat);
        n._j = sib.indexOf(n);
        n._k = sib.length;
      });

      /* ═══════════════════════════════════════════════════════════════════
   SECTORS — each structural group owns one contiguous wedge of the
   circle, sized by how many senses it holds. Same-coloured threads
   therefore always sit together, and neighbouring groups never
   interleave.
   ═══════════════════════════════════════════════════════════════════ */
      const TWO_PI = Math.PI * 2;
      const sectorInfo = new Map();
      (function buildSectors() {
        const PAD = 0.12; // breathing room between neighbouring groups
        const MIN = 0.6; // smallest wedge, so short groups stay readable
        const n = categoryOrder.length;
        const free = Math.max(0, TWO_PI - PAD * n - MIN * n);
        const counts = categoryOrder.map((c) => leavesByCat.get(c).length);
        const total = d3.sum(counts) || 1;
        let cursor = -Math.PI / 2; // start at the top
        categoryOrder.forEach((cat, i) => {
          const span = MIN + (free * counts[i]) / total;
          sectorInfo.set(cat, {
            start: cursor + PAD / 2,
            end: cursor + span - PAD / 2,
            mid: cursor + span / 2,
          });
          cursor += span;
        });
      })();

      function categoryColor(n) {
        return palette[n.cat] || palette.root;
      }
      function nodeColor(n) {
        if (n.depth === 0) return palette.root;
        if (n.depth === 1) return categoryColor(n);
        return modes[mode].colors[n[modes[mode].key]] || "#8fa1b5";
      }
      function nodeWidth(n) {
        if (n.depth === 0) return 116;
        if (n.depth === 1) return Math.max(156, n.data.name.length * 7.1 + 46);
        return Math.max(100, Math.min(270, n.data.name.length * 6.45 + 35));
      }
      function nodeHeight(n) {
        return n.depth === 0 ? 76 : n.depth === 1 ? 48 : 38;
      }

      /* ═══════════════════════════════════════════════════════════════════
   ROOT KEEP-OUT — the big "run" block is a solid obstacle. Every other
   block must slide around it, never through it, so it can neither sit
   on top of it nor hide underneath it.
   ═══════════════════════════════════════════════════════════════════ */
      const ROOT_PAD = 14;
      function rootKeepOutBox(n) {
        return {
          hw: nodeWidth(rootNode) / 2 + nodeWidth(n) / 2 + ROOT_PAD,
          hh: nodeHeight(rootNode) / 2 + nodeHeight(n) / 2 + ROOT_PAD,
        };
      }
      /* move a point (relative to the root centre at 0,0) out of the
         root's rectangle along the shortest axis */
      function pushOutOfRoot(x, y, n) {
        const { hw, hh } = rootKeepOutBox(n);
        const ax = Math.abs(x),
          ay = Math.abs(y);
        if (ax >= hw || ay >= hh) return { x, y };
        const ox = hw - ax,
          oy = hh - ay;
        if (ox <= oy) return { x: (x < 0 ? -1 : 1) * hw, y };
        return { x, y: (y < 0 ? -1 : 1) * hh };
      }

      /* a force that re-applies the obstacle on every tick */
      function rootKeepOutForce() {
        flat.forEach((n) => {
          if (n.depth === 0) return;
          const p = pushOutOfRoot(n.x || 0, n.y || 0, n);
          if (p.x !== n.x) {
            n.x = p.x;
            n.vx = 0;
          }
          if (p.y !== n.y) {
            n.y = p.y;
            n.vy = 0;
          }
        });
      }

      /* ═══════════════════════════════════════════════════════════════════
   TARGET LAYOUT
   A radial base layout where each structural group fills its own
   contiguous wedge, a soft gather when a legend category is chosen,
   and the same keep-out box so no target lands on the "run" block.
   ═══════════════════════════════════════════════════════════════════ */
      function baseTarget(n) {
        if (n.depth === 0) return { x: 0, y: 0 };
        const s = sectorInfo.get(n.cat);
        if (n.depth === 1) {
          return { x: Math.cos(s.mid) * rCat, y: Math.sin(s.mid) * rCat };
        }
        /* spread the leaves of this group across its own wedge only */
        const t = n._k <= 1 ? 0.5 : n._j / (n._k - 1);
        const a = s.start + (s.end - s.start) * (0.12 + 0.76 * t);
        const r = rLeaf + (n._j % 2 ? rStagger : 0);
        return { x: Math.cos(a) * r, y: Math.sin(a) * r };
      }

      function keepOutOfRoot(t, n) {
        if (n.depth === 0) return t;
        return pushOutOfRoot(t.x, t.y, n);
      }

      function targetFor(n) {
        let t = baseTarget(n);
        if (gatherCenter && n.depth === 2 && n[modes[mode].key] === activeCat) {
          t = {
            x: t.x * 0.82 + gatherCenter.x * 0.18,
            y: t.y * 0.82 + gatherCenter.y * 0.18,
          };
        }
        return keepOutOfRoot(t, n);
      }

      function computeGather() {
        gatherCenter = null;
        if (!activeCat) return;
        const key = modes[mode].key;
        const matches = leafNodes.filter((n) => n[key] === activeCat);
        if (!matches.length) return;
        const pts = matches.map(baseTarget);
        gatherCenter = {
          x: d3.mean(pts, (p) => p.x),
          y: d3.mean(pts, (p) => p.y),
        };
      }

      /* ═══════════════════════════════════════════════════════════════════
   SIMULATION — deliberately slow and damped so every re-arrangement
   drifts into place instead of snapping.
   ═══════════════════════════════════════════════════════════════════ */
      /* seed every node on its target (plus a little jitter) so the map
         already opens with the groups sitting next to each other */
      flat.forEach((n) => {
        const t = baseTarget(n);
        n.x = t.x + (Math.random() - 0.5) * 36;
        n.y = t.y + (Math.random() - 0.5) * 36;
      });
      rootNode.x = 0;
      rootNode.y = 0;
      rootNode.fx = 0;
      rootNode.fy = 0;

      const simulation = d3
        .forceSimulation(flat)
        .force(
          "link",
          d3
            .forceLink(links)
            .id((d) => d.id)
            .distance((l) => (l.target.depth === 1 ? 150 : 115))
            .strength((l) => (l.target.depth === 1 ? 0.3 : 0.2)),
        )
        .force("charge", d3.forceManyBody().strength(-95))
        .force(
          "collide",
          d3
            .forceCollide(
              (d) =>
                Math.max(nodeWidth(d) / 2, nodeHeight(d) / 2) +
                (d.depth === 0 ? 46 : 18),
            )
            .iterations(4),
        )
        .force("x", d3.forceX((d) => targetFor(d).x).strength(0.085))
        .force("y", d3.forceY((d) => targetFor(d).y).strength(0.085))
        /* registered last so it always gets the final say near the root */
        .force("rootKeepOut", rootKeepOutForce)
        .velocityDecay(0.45)
        .alphaDecay(0.012)
        .on("tick", ticked);

      /* ═══════════════════════════════════════════════════════════════════
   RENDER
   ═══════════════════════════════════════════════════════════════════ */
      function linkTargetNode(l) {
        return typeof l.target === "object" ? l.target : byId.get(l.target);
      }

      const edge = edges
        .selectAll("path")
        .data(links)
        .join("path")
        .attr("class", (l) =>
          l.target.depth === 1 ? "link category-link" : "link",
        )
        /* the thread keeps the colour of its structural group for ever */
        .style("stroke", (l) => {
          const t = linkTargetNode(l);
          return palette[t.cat] || "#52677c";
        });

      const node = nodesLayer
        .selectAll("g")
        .data(flat, (d) => d.id)
        .join("g")
        .attr(
          "class",
          (d) =>
            "node " +
            (d.depth === 0 ? "root" : d.depth === 1 ? "category" : "leaf"),
        )
        .style("--node-color", (d) => nodeColor(d))
        .on("click", (event, d) => {
          event.stopPropagation();
          if (!event.defaultPrevented) selectNode(d);
        });

      node
        .append("rect")
        .attr("class", "card")
        .attr("x", (d) => -nodeWidth(d) / 2)
        .attr("y", (d) => -nodeHeight(d) / 2)
        .attr("width", nodeWidth)
        .attr("height", nodeHeight)
        .attr("rx", (d) => (d.depth === 0 ? 22 : d.depth === 1 ? 15 : 11));

      node
        .filter((d) => d.depth !== 0)
        .append("circle")
        .attr("class", "glyph")
        .attr("cx", (d) => -nodeWidth(d) / 2 + 17)
        .attr("r", (d) => (d.depth === 1 ? 4.5 : 3.5));

      node
        .append("text")
        .attr("x", (d) =>
          d.depth === 0 ? 0 : -nodeWidth(d) / 2 + (d.depth === 1 ? 31 : 29),
        )
        .attr("text-anchor", (d) => (d.depth === 0 ? "middle" : "start"))
        .text((d) => d.data.name);

      /* the big "run" block always paints on top of everything else */
      node.filter((d) => d.depth === 0).raise();

      /* ═══════════════════════════════════════════════════════════════════
   DRAG  (the root stays pinned as the anchor of the map; any dragged
   block is clamped outside the root rectangle, so it slides around the
   obstacle instead of over or under it)
   ═══════════════════════════════════════════════════════════════════ */
      const drag = d3
        .drag()
        .touchable(() => true)
        .filter((event, d) => d.depth !== 0)
        .on("start", (event, d) => {
          dismissHint();
          if (!event.active) simulation.alphaTarget(0.12).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on("drag", (event, d) => {
          const p = pushOutOfRoot(event.x, event.y, d);
          d.fx = p.x;
          d.fy = p.y;
        })
        .on("end", (event, d) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        });
      node.call(drag);

      /* ═══════════════════════════════════════════════════════════════════
   TICK
   ═══════════════════════════════════════════════════════════════════ */
      function ticked() {
        edge.attr("d", (l) => {
          const dx = l.target.x - l.source.x,
            dy = l.target.y - l.source.y;
          return `M${l.source.x},${l.source.y} Q${(l.source.x + l.target.x) / 2 - dy * 0.08},${(l.source.y + l.target.y) / 2 + dx * 0.08} ${l.target.x},${l.target.y}`;
        });
        node.attr("transform", (d) => `translate(${d.x},${d.y})`);
      }

      /* ═══════════════════════════════════════════════════════════════════
   GROUPING / FILTER STATE
   ═══════════════════════════════════════════════════════════════════ */
      function cap(s) {
        return s.charAt(0).toUpperCase() + s.slice(1);
      }
      function catList() {
        return Object.keys(modes[mode].colors);
      }

      function matchesSearch(n) {
        if (!searchTerm) return true;
        const d = n.data;
        const hay = [
          d.name,
          d.definition,
          d.example,
          d.note,
          d.register,
          d.cls,
          d.use,
          d.form,
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(searchTerm);
      }

      /* Dimming order of precedence — strictly one spotlight at a time:
         1. the legend filter, while it is on;
         2. the structural group the user clicked, only once no legend
            filter is active (the filter clears the group spotlight when
            it is switched on, so switching it off lands back in the plain
            state);
         3. the free-text search. */
      function updateDimming() {
        const key = modes[mode].key;
        const catOK = new Set();
        if (activeCat) {
          flat.forEach((n) => {
            if (n.depth === 2 && n[key] === activeCat) catOK.add(n.parentId);
          });
        }

        node.classed("dim", (n) => {
          if (n.depth === 0) return false;
          if (activeCat) {
            if (n.depth === 2 && n[key] !== activeCat) return true;
            if (n.depth === 1 && !catOK.has(n.id)) return true;
            return !matchesSearch(n);
          }
          if (selectedGroup) return n.cat !== selectedGroup;
          return !matchesSearch(n);
        });

        edge.classed("dim", (l) => {
          const t = linkTargetNode(l);
          if (activeCat) {
            if (t.depth === 2 && t[key] !== activeCat) return true;
            if (t.depth === 1 && !catOK.has(t.id)) return true;
            return !matchesSearch(t);
          }
          if (selectedGroup) return t.cat !== selectedGroup;
          return !matchesSearch(t);
        });
      }

      /* only the little dots follow the grouping mode */
      function updateColors() {
        node.style("--node-color", (d) => nodeColor(d));
        node
          .select(".glyph")
          .transition("glyphfill")
          .duration(900)
          .ease(d3.easeCubicOut)
          .style("fill", (d) => nodeColor(d));
      }

      /* ═══════════════════════════════════════════════════════════════════
   LEGEND  (alone at the bottom left; click to softly gather)
   ═══════════════════════════════════════════════════════════════════ */
      function renderLegend() {
        document.getElementById("legendTitle").textContent = modes[mode].label;
        const host = document.getElementById("legendItems");
        host.replaceChildren();
        catList().forEach((c) => {
          const b = document.createElement("button");
          b.type = "button";
          b.className = activeCat === c ? "active" : "";
          b.setAttribute("aria-pressed", String(activeCat === c));
          const sw = document.createElement("span");
          sw.className = "sw";
          sw.style.background = modes[mode].colors[c];
          const label = document.createElement("span");
          label.textContent = cap(c);
          b.append(sw, label);
          b.addEventListener("click", () => setActive(c));
          host.appendChild(b);
        });
      }

      function setActive(cat) {
        const next = cat === activeCat ? null : cat;
        if (next) {
          /* a legend filter and a group spotlight may never coexist:
             switching the filter on drops any group selection for good,
             so switching it off returns to the plain, unhighlighted map */
          closePanel();
        }
        activeCat = next;
        selectedGroup = null;
        refresh();
      }

      function refresh() {
        renderLegend();
        updateColors();
        updateDimming();
        computeGather();
        simulation.alpha(0.28).restart();
      }

      /* ═══════════════════════════════════════════════════════════════════
   DETAIL PANEL
   ═══════════════════════════════════════════════════════════════════ */
      const CORPUS_TOTAL = 815;

      /* a proper paragraph about the attested tokens, instead of a tag */
      function frequencyHTML(c) {
        if (c.freq === undefined) return "";
        if (c.freq > 0) {
          const pct = ((c.freq / CORPUS_TOTAL) * 100).toFixed(1);
          return `<section class="field"><h4>Tokens in the corpus</h4><p>This sense is attested <strong>${c.freq}</strong> times among the <strong>${CORPUS_TOTAL}</strong> occurrences of <em>run</em> collected by Gries (2006) — roughly <strong>${pct}%</strong> of all its uses. A <em>token</em> is one single occurrence of the word as it appears in running text; the ${CORPUS_TOTAL} tokens are the real sentences this map is drawn from.</p></section>`;
        }
        return `<section class="field"><h4>Tokens in the corpus</h4><p>Not attested among the <strong>${CORPUS_TOTAL}</strong> occurrences of <em>run</em> collected by Gries (2006). A <em>token</em> is one single occurrence of the word as it appears in running text; this sense is recorded in the dictionaries, but it did not surface in that corpus sample.</p></section>`;
      }

      function selectNode(d) {
        dismissHint();
        selected = d;
        /* clicking any node of a structural family spotlights that family,
           but never while a legend filter is running — one at a time */
        selectedGroup = activeCat ? null : d.cat || null;
        node.classed("selected", (n) => n.id === d.id);
        updateDimming();

        const c = d.data,
          html = [];
        if (c.cat)
          html.push(
            `<span class="tag" style="color:${palette[c.cat]}">${labels[c.cat]}</span>`,
          );
        if (c.cls)
          html.push(
            `<span class="tag"><i class="tdot" style="background:${modes.word.colors[c.cls]}"></i>${c.cls}</span>`,
          );
        if (c.use)
          html.push(
            `<span class="tag"><i class="tdot" style="background:${modes.use.colors[c.use]}"></i>${c.use}</span>`,
          );
        if (c.form)
          html.push(
            `<span class="tag"><i class="tdot" style="background:${modes.form.colors[c.form]}"></i>${c.form}</span>`,
          );
        /* the short token tag is back … */
        if (c.freq !== undefined && c.freq > 0)
          html.push(`<span class="tag">${c.freq} / 815 tokens</span>`);
        html.push(`<h2>${c.name}</h2>`);
        if (c.register) html.push(`<div class="register">${c.register}</div>`);
        if (c.definition)
          html.push(
            `<section class="field"><h4>Meaning</h4><p>${c.definition}</p></section>`,
          );
        if (c.example)
          html.push(
            `<section class="field"><h4>Example</h4><p class="example">${c.example}</p></section>`,
          );
        if (c.note)
          html.push(
            `<section class="field"><h4>How it connects</h4><p>${c.note}</p></section>`,
          );
        /* … and the explanatory paragraph sits right beside it */
        html.push(frequencyHTML(c));
        if (c.etymology)
          html.push(
            `<section class="field"><h4>Etymology</h4><p>${c.etymology}</p></section>`,
          );
        document.getElementById("panelContent").innerHTML = html.join("");
        document.getElementById("panel").classList.add("open");
      }

      function closePanel() {
        document.getElementById("panel").classList.remove("open");
        node.classed("selected", false);
        selected = null;
        selectedGroup = null;
        updateDimming();
      }

      document
        .getElementById("closePanel")
        .addEventListener("click", closePanel);
      svg.on("click", closePanel);

      /* ═══════════════════════════════════════════════════════════════════
   GROUPING SWITCHER
   ═══════════════════════════════════════════════════════════════════ */
      document.querySelectorAll("#modes .mode").forEach((btn) => {
        btn.addEventListener("click", () => {
          const m = btn.dataset.mode;
          if (m === mode) return;
          mode = m;
          activeCat = null;
          document.querySelectorAll("#modes .mode").forEach((b) => {
            const on = b === btn;
            b.classList.toggle("active", on);
            b.setAttribute("aria-pressed", String(on));
          });
          refresh();
        });
      });

      /* ═══════════════════════════════════════════════════════════════════
   SEARCH + RESET
   ═══════════════════════════════════════════════════════════════════ */
      document.getElementById("search").addEventListener("input", (e) => {
        searchTerm = e.target.value.trim().toLowerCase();
        updateDimming();
      });

      /* centre the viewport on the big "run" block, slowly and smoothly */
      function centeredView() {
        return d3.zoomIdentity.translate(
          W / 2 - rootNode.x,
          H / 2 - rootNode.y,
        );
      }

      document.getElementById("reset").addEventListener("click", () => {
        closePanel();
        document.getElementById("search").value = "";
        searchTerm = "";
        activeCat = null;
        selectedGroup = null;
        refresh();
        svg
          .transition()
          .duration(1200)
          .ease(d3.easeCubicInOut)
          .call(zoom.transform, centeredView());
      });

      /* ═══════════════════════════════════════════════════════════════════
   RESIZE
   ═══════════════════════════════════════════════════════════════════ */
      function resize() {
        const box = document
          .getElementById("workspace")
          .getBoundingClientRect();
        W = box.width;
        H = box.height;

        /* keep both rings proportional to the canvas */
        const m = Math.min(W, H);
        rCat = Math.max(190, Math.min(300, m * 0.27));
        rLeaf = rCat + Math.max(130, Math.min(220, m * 0.2));
        rStagger = Math.max(0, Math.min(60, m * 0.06));

        svg.attr("viewBox", `0 0 ${W} ${H}`);
        svg.call(zoom.transform, centeredView());
        computeGather();
        simulation.alpha(0.28).restart();
      }
      window.addEventListener("resize", resize);

      /* ═══════════════════════════════════════════════════════════════════
   INIT
   ═══════════════════════════════════════════════════════════════════ */
      renderLegend();
      updateColors();
      updateDimming();
      computeGather();
      resize();
