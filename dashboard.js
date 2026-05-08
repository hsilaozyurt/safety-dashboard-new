/* ================================================================
   Safety Risk Dashboard — dashboard.js
   Sharepoint: Site Assets/dashboard/dashboard.js

   CSV KOLONLARI:
   All_Station_Info.csv  → Loc, Occurence_No, Report_type, Department,
                            Status, MC_Date, MC_Year, MC_Year_Month,
                            Region, Sub_Region, Fleet, likelihood,
                            likelihoodScore, severity, severityScore,
                            Risk_Level, RiskScore, NonSPI, SPI_1, SPI2,
                            Operational_Phase
   Ucus_sayilari.csv     → Loc, Flight Count
   SPI_kategorileri.csv  → SPI, title, SPI_Class

   COMPOSITE SCORE = (Σ RiskScore) / Flight_Count × 100
   ================================================================ */

(function (W) {
  'use strict';

  /* ── RİSK MATRİSİ ────────────────────────────────────────────
     Risk_Level zaten CSV'den geliyor (A/B/C/D/E)
     Static data for displaying the matrix table on screen:       */
  var MATRIX = {
    severities:   [
      { label: 'S5 (20,00)', val: 20   },
      { label: 'S4 (15,00)', val: 15   },
      { label: 'S3 (7,00)',  val: 7    },
      { label: 'S2 (3,50)',  val: 3.5  },
      { label: 'S1 (2,00)',  val: 2    },
      { label: 'S0 (0,10)',  val: 0.10 },
    ],
    likelihoods:  [
      { label: 'Pe (1,50)',  val: 1.5  },
      { label: 'P0 (1,80)',  val: 1.8  },
      { label: 'P1 (2,50)',  val: 2.5  },
      { label: 'P2 (4,00)',  val: 4    },
      { label: 'P3 (5,00)',  val: 5    },
      { label: 'P4 (6,50)',  val: 6.5  },
      { label: 'P5 (10,00)', val: 10   },
    ],
    category: function (score) {
      if (score >= 80)  return 'A';
      if (score >= 45)  return 'B';
      if (score >= 22)  return 'C';
      if (score >= 10)  return 'D';
      return 'E';
    }
  };

  var SEV_COLOR = { A:'#b03a2e', B:'#b85c10', C:'#8c6d10', D:'#276744', E:'#245280' };
  var SEV_BG    = { A:'#fdf1f0', B:'#fdf5ec', C:'#fdfaec', D:'#f0faf4', E:'#eff4fb' };

  /* Chart renk paleti (SPI, Fleet, Dept grafikleri için) */
  var PALETTE = [
    '#1a56db','#b85c10','#276744','#8c6d10','#245280',
    '#6d28d9','#0e7490','#be123c','#15803d','#92400e'
  ];

  /* ── CSV PARSER ──────────────────────────────────────────────── */
  function parseCSV(text) {
    var lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return [];
    var headers = lines[0].split(',').map(function (h) { return h.trim(); });
    return lines.slice(1).map(function (line) {
      /* Tırnak içi virgülleri korumak için basit parser */
      var cols = [];
      var cur = '', inQ = false;
      for (var i = 0; i < line.length; i++) {
        var ch = line[i];
        if (ch === '"') { inQ = !inQ; }
        else if (ch === ',' && !inQ) { cols.push(cur.trim()); cur = ''; }
        else { cur += ch; }
      }
      cols.push(cur.trim());
      var obj = {};
      headers.forEach(function (h, i) { obj[h] = (cols[i] || '').trim(); });
      return obj;
    }).filter(function (r) {
      return Object.values(r).some(function (v) { return v !== ''; });
    });
  }

  function loadCSV(path) {
    return fetch(path).then(function (r) {
      if (!r.ok) throw new Error('Failed to load CSV: ' + path);
      return r.text();
    }).then(parseCSV);
  }

  /* ── FORMAT ──────────────────────────────────────────────────── */
  function fmtNum(n, dec) {
    dec = dec == null ? 1 : dec;
    return parseFloat(n).toLocaleString('tr-TR', {
      minimumFractionDigits: dec, maximumFractionDigits: dec
    });
  }
  function fmtInt(n) { return parseInt(n).toLocaleString('tr-TR'); }

  /* ── DOM HELPER ──────────────────────────────────────────────── */
  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (k === 'class') e.className = v;
      else if (k === 'style') e.style.cssText = v;
      else if (k.slice(0,2) === 'on') e[k] = v;
      else e.setAttribute(k, v);
    });
    if (children) (Array.isArray(children) ? children : [children]).forEach(function (c) {
      if (c == null) return;
      e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return e;
  }

  /* ── SVG ICONS ───────────────────────────────────────────────── */
  function svgIcon(path, size) {
    size = size || 14;
    var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox','0 0 24 24');
    s.setAttribute('width', size);
    s.setAttribute('height', size);
    s.setAttribute('fill','none');
    s.setAttribute('stroke','currentColor');
    s.setAttribute('stroke-width','2');
    s.setAttribute('stroke-linecap','round');
    s.setAttribute('stroke-linejoin','round');
    s.innerHTML = path;
    return s;
  }
  var IC = {
    shield:  '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    alert:   '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
    plane:   '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    filter:  '<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>',
    station: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/>',
    chart:   '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
  };

  /* ── VERİ İŞLEME ─────────────────────────────────────────────── */
  function processData(incidents, flightRows, spiRows) {
    /* Uçuş haritası: Loc → Flight Count */
    var flightMap = {};
    flightRows.forEach(function (r) {
      var loc = (r['Loc'] || r['LOC'] || r['loc'] || '').toUpperCase().trim();
      var cnt = parseFloat((r['Flight Count'] || r['Ucus_Sayisi'] || r['flight_count'] || '0').replace(/[^0-9.]/g,'')) || 0;
      if (loc) flightMap[loc] = cnt;
    });

    /* SPI haritası: SPI kodu → { title, SPI_Class } */
    var spiMap = {};
    spiRows.forEach(function (r) {
      var code = (r['SPI'] || '').trim();
      if (code) spiMap[code] = { title: (r['title'] || code), cls: (r['SPI_Class'] || '') };
    });

    /* Olayları normalize et */
    var rows = incidents.map(function (r) {
      var loc       = (r['Loc'] || r['LOC'] || '').toUpperCase().trim();
      var riskScore = parseFloat(r['RiskScore'] || r['Risk_Score'] || 0) || 0;
      var riskLevel = (r['Risk_Level'] || r['RiskLevel'] || '').trim().toUpperCase();
      if (!riskLevel) riskLevel = MATRIX.category(riskScore);

      /* SPI etiketleri: NonSPI false ise SPI_1 ve SPI2 dolu olabilir */
      var nonSPI = (r['NonSPI'] || '').toLowerCase();
      var isNonSPI = (nonSPI === 'true' || nonSPI === '1');
      var spi1 = (r['SPI_1'] || r['SPI1'] || '').trim();
      var spi2 = (r['SPI2']  || r['SPI_2'] || '').trim();
      var spiTags = [];
      if (!isNonSPI) {
        if (spi1) spiTags.push(spi1);
        if (spi2) spiTags.push(spi2);
      }

      return {
        loc:       loc,
        occNo:     r['Occurence_No'] || r['Occurrence_No'] || '',
        repType:   r['Report_type'] || r['Report_Type'] || '',
        dept:      r['Department'] || '',
        status:    r['Status'] || '',
        date:      r['MC_Date'] || '',
        year:      r['MC_Year'] || '',
        yearMonth: r['MC_Year_Month'] || '',
        region:    r['Bölge'] || r['Bolge'] || r['Region'] || '',
        subRegion: r['Alt Bölge'] || r['Alt_Bolge'] || r['Sub_Region'] || '',
        fleet:     r['Fleet'] || '',
        likelihood:      r['likelihood'] || '',
        likelihoodScore: parseFloat(r['likelihoodScore'] || 0) || 0,
        severity:        r['severity'] || '',
        severityScore:   parseFloat(r['severityScore'] || 0) || 0,
        riskLevel:  riskLevel,
        riskScore:  riskScore,
        nonSPI:     isNonSPI,
        spiTags:    spiTags,
        opPhase:    r['Operational_Phase'] || '',
      };
    }).filter(function (r) { return r.loc; });

    /* Stations bazlı gruplama */
    var stMap = {};
    rows.forEach(function (r) {
      if (!stMap[r.loc]) stMap[r.loc] = { loc: r.loc, incidents: [] };
      stMap[r.loc].incidents.push(r);
    });

    var stations = Object.values(stMap).map(function (st) {
      var incs = st.incidents;
      var totalRisk = incs.reduce(function (s, i) { return s + i.riskScore; }, 0);
      var flights   = flightMap[st.loc] || 0;
      var composite = flights > 0 ? (totalRisk / flights * 100) : totalRisk / incs.length;
      var catCounts = { A:0, B:0, C:0, D:0, E:0 };
      incs.forEach(function (i) { if (catCounts[i.riskLevel] != null) catCounts[i.riskLevel]++; });
      return {
        loc:        st.loc,
        incidents:  incs,
        count:      incs.length,
        totalRisk:  totalRisk,
        flights:    flights,
        composite:  composite,
        compLevel:  MATRIX.category(composite),
        catCounts:  catCounts,
        highSev:    (catCounts.A || 0) + (catCounts.B || 0),
      };
    });
    stations.sort(function (a, b) { return b.composite - a.composite; });

    return { rows: rows, stations: stations, flightMap: flightMap, spiMap: spiMap };
  }

  /* ── KPI ─────────────────────────────────────────────────────── */
  function calcKPIs(rows, stations) {
    var totalInc    = rows.length;
    var totalFlight = stations.reduce(function (s, st) { return s + st.flights; }, 0);
    var avgRisk     = rows.length ? rows.reduce(function (s, r) { return s + r.riskScore; }, 0) / rows.length : 0;
    var highSev     = rows.filter(function (r) { return r.riskLevel === 'A' || r.riskLevel === 'B'; }).length;
    var topSt       = stations[0] || null;
    return { totalInc, totalFlight, avgRisk, highSev, topSt, stCount: stations.length };
  }

  /* ════════════════════════════════════════════════════════════════
     RENDER
     ════════════════════════════════════════════════════════════════ */

  /* ── TOP BAR ─────────────────────────────────────────────────── */
  function renderTopBar(root, stCount) {
    var now = new Date().toLocaleString('tr-TR', {
      day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'
    });
    root.appendChild(el('div', { class:'srd-topbar' }, [
      el('div', { class:'srd-logo' }, [
        svgIcon(IC.shield, 18),
        document.createTextNode('Safety Risk Dashboard'),
        el('span', { class:'srd-logo-badge' }, stCount + ' Stations')
      ]),
      el('span', { class:'srd-topbar-right' }, 'Last updated: ' + now)
    ]));
  }

  /* ── FILTER BAR ──────────────────────────────────────────────── */
  function renderFilterBar(root, rows, spiMap, onChange) {
    var years   = uniq(rows.map(function(r){ return r.year; })).filter(Boolean).sort().reverse();
    var months  = uniq(rows.map(function(r){ return r.yearMonth; })).filter(Boolean).sort().reverse();
    var depts   = uniq(rows.map(function(r){ return r.dept; })).filter(Boolean).sort();
    var fleets  = uniq(rows.map(function(r){ return r.fleet; })).filter(Boolean).sort();
    var rtypes  = uniq(rows.map(function(r){ return r.repType; })).filter(Boolean).sort();
    var bolgeler= uniq(rows.map(function(r){ return r.region; })).filter(Boolean).sort();
    var spiCodes= uniq(
      rows.reduce(function(acc, r){ return acc.concat(r.spiTags); }, [])
    ).filter(Boolean).sort();

    function mkSel(id, label, opts) {
      var s = el('select', { id: id, onchange: onChange });
      s.appendChild(el('option', { value:'' }, label));
      opts.forEach(function(o){ s.appendChild(el('option', { value:o }, o)); });
      return s;
    }

    root.appendChild(el('div', { class:'srd-filterbar' }, [
      el('div', { class:'srd-filter-label' }, [ svgIcon(IC.filter, 13), document.createTextNode('Filter') ]),
      mkSel('srd-f-year',   'All Years',       years),
      mkSel('srd-f-month',  'All Months',         months),
      mkSel('srd-f-dept',   'All Departments',  depts),
      mkSel('srd-f-fleet',  'All Fleets',          fleets),
      mkSel('srd-f-rtype',  'All Report Types', rtypes),
      mkSel('srd-f-bolge',  'All Regions',      bolgeler),
      mkSel('srd-f-sev',    'All Levels',     ['A','B','C','D','E']),
      mkSel('srd-f-status', 'All Statuses',      ['Open','Closed','In Progress']),
      mkSel('srd-f-spi',    'All SPI',           spiCodes),
    ]));
  }

  /* ── KPI CARDS ───────────────────────────────────────────────── */
  function renderKPIs(container, kpis) {
    container.innerHTML = '';
    var cards = [
      { cls:'k-blue',   icon:IC.alert,   label:'Total Recorded Events', val: fmtInt(kpis.totalInc),    sub:'All stations' },
      { cls:'k-green',  icon:IC.plane,   label:'Total Flights',         val: fmtInt(kpis.totalFlight), sub:'Station total' },
      { cls:'k-orange', icon:IC.chart,   label:'Average Risk Score',    val: fmtNum(kpis.avgRisk, 1),  sub:'All events average' },
      { cls:'k-gray',   icon:IC.station, label:'Monitored Stations',    val: String(kpis.stCount),     sub:'Active' },
    ];
    cards.forEach(function (c) {
      container.appendChild(el('div', { class:'srd-kpi ' + c.cls }, [
        el('div', { class:'srd-kpi-label' }, [ svgIcon(c.icon, 12), document.createTextNode(c.label) ]),
        el('div', { class:'srd-kpi-val' }, c.val),
        el('div', { class:'srd-kpi-sub' }, c.sub),
      ]));
    });
  }

  /* ── BAR CHART ───────────────────────────────────────────────── */
  function renderBarChart(canvasId, stations) {
    var top10 = stations.slice(0, 10);
    var ex = Chart.getChart(canvasId); if (ex) ex.destroy();
    new Chart(document.getElementById(canvasId), {
      type: 'bar',
      data: {
        labels: top10.map(function(s){ return s.loc; }),
        datasets: [{ label:'Composite Score',
          data: top10.map(function(s){ return parseFloat(s.composite.toFixed(2)); }),
          backgroundColor: top10.map(function(s){ return SEV_BG[s.compLevel]; }),
          borderColor:     top10.map(function(s){ return SEV_COLOR[s.compLevel]; }),
          borderWidth: 1, borderRadius: 2, barThickness: 14,
        }],
      },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: {
            label:       function(c){ return ' Composite: ' + c.raw.toFixed(2); },
            afterLabel:  function(c){ var s=top10[c.dataIndex]; return ' Level: '+s.compLevel+'  |  Events: '+s.count; }
          }},
        },
        scales: {
          x: { grid:{ color:'#e9ecf0' }, ticks:{ font:{size:10}, color:'#8a97a8' } },
          y: { grid:{ display:false },   ticks:{ font:{size:11, weight:'600'}, color:'#1c2b3a' } },
        },
      },
    });
  }

  /* ── DONUT CHART ─────────────────────────────────────────────── */
  var _donut = null;
  function buildDonutSets(rows, spiMap) {
    /* Risk Level */
    var sev = { A:0, B:0, C:0, D:0, E:0 };
    rows.forEach(function(r){ if(sev[r.riskLevel]!=null) sev[r.riskLevel]++; });

    /* SPI Class dağılımı */
    var spiClassMap = {};
    rows.forEach(function(r){
      r.spiTags.forEach(function(tag){
        var cls = (spiMap[tag] && spiMap[tag].cls) ? spiMap[tag].cls : (tag || 'NonSPI');
        spiClassMap[cls] = (spiClassMap[cls]||0) + 1;
      });
      if (r.nonSPI || r.spiTags.length === 0) {
        spiClassMap['NonSPI'] = (spiClassMap['NonSPI']||0) + 1;
      }
    });

    /* Fleet dağılımı */
    var fleetMap = {};
    rows.forEach(function(r){ if(r.fleet){ fleetMap[r.fleet]=(fleetMap[r.fleet]||0)+1; } });

    /* Department dağılımı */
    var deptMap = {};
    rows.forEach(function(r){ if(r.dept){ deptMap[r.dept]=(deptMap[r.dept]||0)+1; } });

    /* Aylık trend için line chart kullanacağız, burada sadece donut setleri */
    function toSet(map, colors) {
      var keys = Object.keys(map).sort(function(a,b){ return map[b]-map[a]; });
      return { labels: keys, data: keys.map(function(k){ return map[k]; }),
               colors: keys.map(function(_,i){ return colors[i % colors.length]; }) };
    }

    return {
      sev: {
        labels: ['A — Critical','B — High','C — Medium','D — Low','E — Very Low'],
        data:   [sev.A, sev.B, sev.C, sev.D, sev.E],
        colors: [SEV_COLOR.A, SEV_COLOR.B, SEV_COLOR.C, SEV_COLOR.D, SEV_COLOR.E],
      },
      spi:   toSet(spiClassMap, PALETTE),
      fleet: toSet(fleetMap,    PALETTE),
      dept:  toSet(deptMap,     PALETTE),
    };
  }

  function renderDonut(canvasId, legendId, key, sets) {
    var d = sets[key];
    if (_donut) _donut.destroy();
    _donut = new Chart(document.getElementById(canvasId), {
      type: 'doughnut',
      data: { labels: d.labels, datasets:[{
        data: d.data, backgroundColor: d.colors, borderWidth: 2, borderColor:'#ffffff'
      }]},
      options: {
        responsive:true, maintainAspectRatio:false, cutout:'62%',
        plugins: {
          legend: { display:false },
          tooltip: { callbacks: { label: function(c){
            var tot = c.dataset.data.reduce(function(a,b){return a+b;},0);
            return ' '+c.raw.toLocaleString('tr-TR')+' (%'+(tot?(c.raw/tot*100).toFixed(1):'0')+')';
          }}},
        },
      },
    });
    var legEl = document.getElementById(legendId);
    if (!legEl) return;
    var total = d.data.reduce(function(a,b){return a+b;},0);
    legEl.innerHTML = '';
    d.labels.forEach(function(lbl,i){
      var pct = total ? (d.data[i]/total*100).toFixed(1) : '0';
      legEl.appendChild(el('div',{class:'srd-leg-row'},[
        el('div',{class:'srd-leg-left'},[
          el('div',{class:'srd-leg-dot',style:'background:'+d.colors[i]}),
          el('span',{class:'srd-leg-name'},lbl),
        ]),
        el('div',{class:'srd-leg-right'},[
          el('span',{class:'srd-leg-val'},d.data[i].toLocaleString('tr-TR')),
          el('span',{class:'srd-leg-pct'},'%'+pct),
        ]),
      ]));
    });
  }

  /* ── LINE CHART (aylık trend) ────────────────────────────────── */
  function renderLineChart(canvasId, rows) {
    var monthMap = {};
    rows.forEach(function(r){
      var m = (r.yearMonth || r.date || '').slice(0,7);
      if (m) monthMap[m] = (monthMap[m]||0)+1;
    });
    var labels = Object.keys(monthMap).sort();
    var data   = labels.map(function(k){ return monthMap[k]; });
    var ex = Chart.getChart(canvasId); if (ex) ex.destroy();
    new Chart(document.getElementById(canvasId), {
      type:'line',
      data:{ labels:labels, datasets:[{
        label:'Event Count', data:data,
        borderColor:'#1a56db', backgroundColor:'rgba(26,86,219,.07)',
        borderWidth:1.5, pointRadius:0, pointHoverRadius:4,
        tension:0.4, fill:true,
      }]},
      options:{
        responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{display:false}, tooltip:{callbacks:{label:function(c){return ' '+c.raw+' events';}}} },
        scales:{
          x:{ grid:{color:'#e9ecf0'}, ticks:{font:{size:9},color:'#8a97a8',maxTicksLimit:10} },
          y:{ grid:{color:'#e9ecf0'}, ticks:{font:{size:10},color:'#8a97a8'}, min:0 },
        },
      },
    });
  }

  /* ── STATION TABLE ───────────────────────────────────────────── */
  function renderStationTable(tbodyId, countId, stations, sevFilter, search, sortKey) {
    sevFilter = sevFilter||'all'; search=search||''; sortKey=sortKey||'composite';
    var data = stations.slice();
    if (sevFilter!=='all') data=data.filter(function(s){return s.compLevel===sevFilter;});
    if (search){ var q=search.toLowerCase(); data=data.filter(function(s){return s.loc.toLowerCase().includes(q);}); }
    if (sortKey==='olay')     data.sort(function(a,b){return b.count-a.count;});
    else if (sortKey==='ucus') data.sort(function(a,b){return b.flights-a.flights;});
    else                       data.sort(function(a,b){return b.composite-a.composite;});

    var countEl = document.getElementById(countId);
    if (countEl) countEl.textContent = data.length+' records';

    var tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    if (!data.length) { tbody.innerHTML='<tr><td colspan="8" style="text-align:center;padding:20px;color:#8a97a8">No records found</td></tr>'; return; }

    var maxC = Math.max.apply(null, data.map(function(s){return s.composite;})) || 1;
    var CATS = ['A','B','C','D','E'];
    tbody.innerHTML = '';
    data.forEach(function(s, i) {
      var fw = Math.round(s.composite/maxC*100);
      var tc = CATS.reduce(function(sum,c){return sum+(s.catCounts[c]||0);},0)||1;
      var bars = CATS.map(function(c){
        var w = Math.round((s.catCounts[c]||0)/tc*60);
        return w>0 ? '<div class="srd-profile-bar" style="width:'+w+'px;background:'+SEV_COLOR[c]+'"></div>' : '';
      }).join('');
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td class="srd-rank">#'+(i+1)+'</td>'+
        '<td><div class="srd-loc">'+s.loc+'</div><div class="srd-profile-bars">'+bars+'</div></td>'+
        '<td class="srd-num">'+s.count+'</td>'+
        '<td class="srd-num">'+fmtNum(s.composite,2)+'</td>'+
        '<td class="srd-num">'+fmtInt(s.flights)+'</td>'+
        '<td><div class="srd-score-wrap">'+
          '<div class="srd-score-bg"><div class="srd-score-fill" style="width:'+fw+'%;background:'+SEV_COLOR[s.compLevel]+'"></div></div>'+
          '<span class="srd-num" style="font-size:11px;min-width:32px">'+fmtNum(s.composite,2)+'</span>'+
        '</div></td>'+
        '<td><span class="srd-badge '+s.compLevel.toLowerCase()+'">'+s.compLevel+'</span></td>'+
        '<td class="srd-num">'+s.highSev+'</td>';
      tbody.appendChild(tr);
    });
  }

  /* ── SPI TABLE ──────────────────────────────────────────────── */
  function renderSPITable(tbodyId, rows, spiMap) {
    var tbody = document.getElementById(tbodyId);
    if (!tbody) return;

    /* Build per-SPI aggregation */
    var spiAgg = {};

    rows.forEach(function(r) {
      var tags = r.spiTags && r.spiTags.length ? r.spiTags : ['NonSPI'];
      tags.forEach(function(tag) {
        if (!spiAgg[tag]) spiAgg[tag] = { code: tag, count: 0, totalRisk: 0, levels: {A:0,B:0,C:0,D:0,E:0} };
        spiAgg[tag].count++;
        spiAgg[tag].totalRisk += r.riskScore || 0;
        if (spiAgg[tag].levels[r.riskLevel] != null) spiAgg[tag].levels[r.riskLevel]++;
      });
    });

    var totalEvents = rows.length || 1;
    var items = Object.values(spiAgg).sort(function(a,b){ return b.totalRisk - a.totalRisk; });

    if (!items.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;color:#8a97a8">No SPI data available</td></tr>';
      return;
    }

    var maxCount = Math.max.apply(null, items.map(function(i){ return i.count; })) || 1;
    var CATS = ['A','B','C','D','E'];

    tbody.innerHTML = '';
    items.forEach(function(item) {
      var info     = spiMap[item.code] || {};
      var title    = info.title || (item.code === 'NonSPI' ? 'Non-SPI Event' : item.code);
      var cls      = info.cls  || '—';
      var avgRisk  = item.count ? (item.totalRisk / item.count) : 0;
      var barW     = Math.round(item.count / maxCount * 100);
      var pct      = ((item.count / totalEvents) * 100).toFixed(1);

      /* Mini level breakdown bars */
      var levelBars = CATS.map(function(c) {
        var w = Math.round((item.levels[c] || 0) / item.count * 50);
        return w > 0
          ? '<div style="height:5px;width:'+w+'px;background:'+SEV_COLOR[c]+';border-radius:1px;display:inline-block;margin-right:1px"></div>'
          : '';
      }).join('');

      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td><span style="font-family:Consolas,monospace;font-size:11px;font-weight:600;color:'+(item.code==='NonSPI'?'#8a97a8':'#1a56db')+'">'+item.code+'</span></td>' +
        '<td style="font-size:11px;color:#4a5a6a;max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="'+title+'">'+title+'</td>' +
        '<td><span style="font-size:10px;font-weight:600;padding:2px 6px;border-radius:4px;background:#f0f2f5;color:#4a5a6a">'+cls+'</span></td>' +
        '<td>' +
          '<div style="display:flex;align-items:center;gap:7px">' +
            '<div style="flex:1;background:#e9ecf0;border-radius:2px;height:5px;min-width:50px">' +
              '<div style="width:'+barW+'%;height:100%;background:#1a56db;border-radius:2px"></div>' +
            '</div>' +
            '<span style="font-family:Consolas,monospace;font-size:11px;min-width:28px">'+item.count+'</span>' +
            '<span style="font-size:10px;color:#8a97a8">'+pct+'%</span>' +
          '</div>' +
        '</td>' +
        '<td style="font-family:Consolas,monospace;font-size:11px;color:#4a5a6a">'+avgRisk.toFixed(2)+'</td>' +
        '<td><div style="display:flex;gap:1px;align-items:center">'+levelBars+'</div></td>';
      tbody.appendChild(tr);
    });
  }

  /* ── RISK MATRIX TABLE ───────────────────────────────────────── */
  function renderRiskMatrix(containerId) {
    var cont=document.getElementById(containerId); if(!cont) return;
    var wrap=el('div',{class:'srd-matrix-wrap'});
    var tbl=el('table',{class:'srd-matrix'});
    var thead=el('thead'); var hrow=el('tr');
    hrow.appendChild(el('th',{class:'rh',colspan:'2'},'SEVERITY'));
    MATRIX.likelihoods.forEach(function(lh){ hrow.appendChild(el('th',{},lh.label)); });
    thead.appendChild(hrow); tbl.appendChild(thead);
    var tbody=el('tbody');
    MATRIX.severities.forEach(function(sv,si){
      var tr=el('tr');
      if(si===0){
        var ax=document.createElement('td');
        ax.setAttribute('rowspan',String(MATRIX.severities.length));
        ax.style.cssText='writing-mode:vertical-rl;transform:rotate(180deg);text-align:center;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:#8a97a8;background:#f6f8fa;border:1px solid #dde1e7;padding:8px 6px';
        ax.textContent='LIKELIHOOD';
        tr.appendChild(ax);
      }
      tr.appendChild(el('td',{class:'rh'},sv.label));
      MATRIX.likelihoods.forEach(function(lh){
        var score=sv.val*lh.val;
        var cat=MATRIX.category(score);
        tr.appendChild(el('td',{class:cat.toLowerCase()},cat+' ('+( score%1===0?score.toFixed(0):score.toFixed(2) )+')'));
      });
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody); wrap.appendChild(tbl); cont.appendChild(wrap);
  }

  /* ── LAYOUT BUILDER ──────────────────────────────────────────── */
  function buildLayout(root) {
    var kpiGrid = el('div',{class:'srd-kpi-grid',id:'srd-kpi-grid'});

    /* Bar card */
    var barCard = el('div',{class:'srd-card'},[
      el('div',{class:'srd-card-header'},[
        el('div',{},[
          el('div',{class:'srd-card-title'},[el('span',{class:'srd-card-dot',style:'background:'+SEV_COLOR.B}),document.createTextNode('Top 10 Highest Risk Stations')]),
          el('div',{class:'srd-card-sub'},'Composite score = (Σ RiskScore / Flights) × 100'),
        ])
      ]),
      el('div',{class:'srd-card-body'},[el('div',{class:'srd-chart-wrap'},el('canvas',{id:'srd-bar','aria-label':'Top 10 istasyon bar grafik'}))])
    ]);

    /* Donut tabs */
    var dtabs = el('div',{class:'srd-dtabs'});
    [['sev','Risk Level'],['spi','SPI Class'],['fleet','Fleet'],['dept','Department']].forEach(function(pair){
      var key=pair[0], lbl=pair[1];
      var btn=el('button',{class:'srd-dtab'+(key==='sev'?' active':'')},lbl);
      btn.onclick=function(){
        dtabs.querySelectorAll('.srd-dtab').forEach(function(b){b.classList.remove('active');});
        btn.classList.add('active');
        if(W._srdSets) renderDonut('srd-donut','srd-donut-leg',key,W._srdSets);
      };
      dtabs.appendChild(btn);
    });

    var donutCard = el('div',{class:'srd-card'},[
      el('div',{class:'srd-card-header'},[
        el('div',{},[
          el('div',{class:'srd-card-title'},[el('span',{class:'srd-card-dot',style:'background:#1a56db'}),document.createTextNode('Risk Distribution')]),
          el('div',{class:'srd-card-sub'},'Level · SPI · Fleet · Department'),
        ])
      ]),
      el('div',{class:'srd-card-body'},[
        dtabs,
        el('div',{class:'srd-donut-wrap'},[
          el('div',{class:'srd-donut-canvas'},el('canvas',{id:'srd-donut','aria-label':'Distribution chart'})),
          el('div',{class:'srd-donut-legend',id:'srd-donut-leg'}),
        ])
      ])
    ]);

    var lineCard = el('div',{class:'srd-card'},[
      el('div',{class:'srd-card-header'},[
        el('div',{},[
          el('div',{class:'srd-card-title'},[el('span',{class:'srd-card-dot',style:'background:#1a56db'}),document.createTextNode('Monthly Event Trend')]),
          el('div',{class:'srd-card-sub'},'Based on MC_Year_Month'),
        ])
      ]),
      el('div',{class:'srd-card-body'},[el('div',{class:'srd-chart-wrap'},el('canvas',{id:'srd-line','aria-label':'Monthly trend'}))])
    ]);

    var chartsRow = el('div',{class:'srd-charts-row'},[barCard,donutCard,lineCard]);

    /* Station table controls */
    function mkSevBtns(prefix, onChange) {
      var wrap = el('div',{class:'srd-sev-btns'});
      [['all','All'],['A','A'],['B','B'],['C','C'],['D','D'],['E','E']].forEach(function(pair){
        var val=pair[0], lbl=pair[1];
        var btn=el('button',{class:'srd-sev-btn'+(val==='all'?' on-all':'')},lbl);
        btn.onclick=function(){
          wrap.querySelectorAll('.srd-sev-btn').forEach(function(b){b.className='srd-sev-btn';});
          btn.className='srd-sev-btn on-'+val;
          W['_srd'+prefix+'Sev']=val;
          onChange();
        };
        wrap.appendChild(btn);
      });
      return wrap;
    }

    var stSearch  = el('input',{class:'srd-search',id:'srd-st-search',type:'text',placeholder:'Search station...'});
    var stSort    = el('select',{class:'srd-sort-sel',id:'srd-st-sort'},[
      el('option',{value:'composite'},'Composite Score'),
      el('option',{value:'olay'},'Event Count'),
      el('option',{value:'ucus'},'Flight Count'),
    ]);
    var stSevBtns = mkSevBtns('St', function(){
      if(W._srdData) renderStationTable('srd-st-tbody','srd-st-count',
        W._srdData.stations, W._srdStSev, stSearch.value, stSort.value);
    });
    stSearch.oninput = function(){
      if(W._srdData) renderStationTable('srd-st-tbody','srd-st-count',
        W._srdData.stations, W._srdStSev||'all', stSearch.value, stSort.value);
    };
    stSort.onchange = function(){
      if(W._srdData) renderStationTable('srd-st-tbody','srd-st-count',
        W._srdData.stations, W._srdStSev||'all', stSearch.value, stSort.value);
    };

    var stCard = el('div',{class:'srd-card'},[
      el('div',{class:'srd-card-header'},[
        el('div',{},[el('div',{class:'srd-card-title'},[el('span',{class:'srd-card-dot',style:'background:'+SEV_COLOR.B}),document.createTextNode('Station List')]),el('span',{class:'srd-tbl-count',id:'srd-st-count'},'—')]),
        el('div',{class:'srd-tbl-controls'},[stSearch,stSevBtns,stSort]),
      ]),
      el('div',{class:'srd-tbl-wrap'},[
        el('table',{},[
          el('thead',{},[el('tr',{},[
            el('th',{},'#'),el('th',{},'Loc'),el('th',{},'Events'),
            el('th',{},'Composite'),el('th',{},'Flights'),
            el('th',{},'Score'),el('th',{},'Level'),el('th',{},'A+B High Sev'),
          ])]),
          el('tbody',{id:'srd-st-tbody'}),
        ])
      ])
    ]);

    /* SPI Summary Panel */
    var spiCard = el('div',{class:'srd-card'},[
      el('div',{class:'srd-card-header'},[
        el('div',{},[
          el('div',{class:'srd-card-title'},[
            el('span',{class:'srd-card-dot',style:'background:#1a56db'}),
            document.createTextNode('SPI Category Summary')
          ]),
          el('div',{class:'srd-card-sub'},'Event count & average risk score by SPI class')
        ])
      ]),
      el('div',{class:'srd-tbl-wrap'},[
        el('table',{},[
          el('thead',{},[el('tr',{},[
            el('th',{},'SPI Code'),
            el('th',{},'Title'),
            el('th',{},'Class'),
            el('th',{},'Events'),
            el('th',{},'Avg Risk'),
            el('th',{},'Distribution'),
          ])]),
          el('tbody',{id:'srd-spi-tbody'}),
        ])
      ])
    ]);

    var tablesRow = el('div',{class:'srd-tables-row'},[stCard,spiCard]);

    /* Risk matrix */
    var matrixSec = el('div',{class:'srd-matrix-section'},[
      el('div',{class:'srd-matrix-title'},'Tablo-6: Risk Matrix Reference'),
      el('div',{id:'srd-matrix-cont'}),
    ]);

    root.appendChild(el('div',{class:'srd-main'},[kpiGrid,chartsRow,tablesRow,matrixSec]));
  }

  /* ── FİLTRE UYGULA ───────────────────────────────────────────── */
  function applyFilters(allRows, allStations) {
    var year   = (document.getElementById('srd-f-year')   ||{}).value||'';
    var month  = (document.getElementById('srd-f-month')  ||{}).value||'';
    var dept   = (document.getElementById('srd-f-dept')   ||{}).value||'';
    var fleet  = (document.getElementById('srd-f-fleet')  ||{}).value||'';
    var rtype  = (document.getElementById('srd-f-rtype')  ||{}).value||'';
    var bolge  = (document.getElementById('srd-f-bolge')  ||{}).value||'';
    var sev    = (document.getElementById('srd-f-sev')    ||{}).value||'';
    var status = (document.getElementById('srd-f-status') ||{}).value||'';
    var spi    = (document.getElementById('srd-f-spi')    ||{}).value||'';

    var rows = allRows.filter(function(r){
      if(year   && r.year    !== year)   return false;
      if(month  && r.yearMonth !== month) return false;
      if(dept   && r.dept    !== dept)   return false;
      if(fleet  && r.fleet   !== fleet)  return false;
      if(rtype  && r.repType !== rtype)  return false;
      if(bolge  && r.region   !== bolge)  return false;
      if(sev    && r.riskLevel !== sev)  return false;
      if(status && r.status  !== status) return false;
      if(spi    && !r.spiTags.includes(spi)) return false;
      return true;
    });

    /* Station listesi de filtreden geçmiş eventslardan yeniden hesapla */
    var stMap = {};
    rows.forEach(function(r){
      if(!stMap[r.loc]) stMap[r.loc]={ loc:r.loc, incidents:[] };
      stMap[r.loc].incidents.push(r);
    });
    var stations = Object.values(stMap).map(function(st){
      var incs=st.incidents;
      var totalRisk=incs.reduce(function(s,i){return s+i.riskScore;},0);
      var flights=allStations.find(function(s){return s.loc===st.loc;});
      flights = flights ? flights.flights : 0;
      var composite = flights>0 ? totalRisk/flights*100 : (incs.length ? totalRisk/incs.length : 0);
      var catCounts={A:0,B:0,C:0,D:0,E:0};
      incs.forEach(function(i){if(catCounts[i.riskLevel]!=null)catCounts[i.riskLevel]++;});
      return { loc:st.loc, incidents:incs, count:incs.length, totalRisk:totalRisk,
               flights:flights, composite:composite, compLevel:MATRIX.category(composite),
               catCounts:catCounts, highSev:(catCounts.A||0)+(catCounts.B||0) };
    });
    stations.sort(function(a,b){return b.composite-a.composite;});
    return { rows:rows, stations:stations };
  }

  /* ── UTILITY ─────────────────────────────────────────────────── */
  function uniq(arr) {
    var seen={}, out=[];
    arr.forEach(function(v){ if(!seen[v]){seen[v]=1;out.push(v);} });
    return out;
  }

  /* ── INIT ────────────────────────────────────────────────────── */
  function init(config) {
    config = config || {};
    var incPath  = config.incidentsCsv  || 'data/All_Station_Info.csv';
    var fltPath  = config.stationsCsv   || 'data/Ucus_sayilari.csv';
    var spiPath  = config.spiCsv        || 'data/SPI_kategorileri.csv';
    var rootId   = config.rootId        || 'srd-root';

    var root = document.getElementById(rootId);
    if (!root){ console.error('SRD: #'+rootId+' not found'); return; }
    root.innerHTML = '';

    /* Chart.js yükle */
    function loadChartJS(cb){
      if(W.Chart){ cb(); return; }
      var s=document.createElement('script');
      s.src='https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js';
      s.onload=cb; document.head.appendChild(s);
    }

    loadChartJS(function(){
      Promise.all([loadCSV(incPath), loadCSV(fltPath), loadCSV(spiPath)])
        .then(function(results){
          var incidents=results[0], flightRows=results[1], spiRows=results[2];
          var processed = processData(incidents, flightRows, spiRows);
          W._srdAllRows     = processed.rows;
          W._srdAllStations = processed.stations;
          W._srdData        = processed;
          W._srdStSev       = 'all';
          W._srdIncSev      = 'all';

          renderTopBar(root, processed.stations.length);
          renderFilterBar(root, processed.rows, processed.spiMap, function(){
            var f = applyFilters(W._srdAllRows, W._srdAllStations);
            W._srdData.rows     = f.rows;
            W._srdData.stations = f.stations;
            var kpis = calcKPIs(f.rows, f.stations);
            renderKPIs(document.getElementById('srd-kpi-grid'), kpis);
            renderBarChart('srd-bar', f.stations);
            W._srdSets = buildDonutSets(f.rows, processed.spiMap);
            renderDonut('srd-donut','srd-donut-leg','sev',W._srdSets);
            renderLineChart('srd-line', f.rows);
            renderStationTable('srd-st-tbody','srd-st-count', f.stations, W._srdStSev||'all','',
              (document.getElementById('srd-st-sort')||{}).value||'composite');
            renderSPITable('srd-spi-tbody', f.rows, processed.spiMap);
          });
          buildLayout(root);

          var kpis = calcKPIs(processed.rows, processed.stations);
          renderKPIs(document.getElementById('srd-kpi-grid'), kpis);
          renderBarChart('srd-bar', processed.stations);
          W._srdSets = buildDonutSets(processed.rows, processed.spiMap);
          renderDonut('srd-donut','srd-donut-leg','sev',W._srdSets);
          renderLineChart('srd-line', processed.rows);
          renderStationTable('srd-st-tbody','srd-st-count', processed.stations);
          renderSPITable('srd-spi-tbody', processed.rows, processed.spiMap);
          renderRiskMatrix('srd-matrix-cont');
        })
        .catch(function(err){
          root.innerHTML='<div style="padding:40px;color:#b03a2e;font-family:sans-serif">'+
            '<strong>Error:</strong> '+err.message+'<br><br>'+
            'Please ensure CSV files are in the correct location.</div>';
        });
    });
  }

  W.SRD = { init: init };

})(window);
