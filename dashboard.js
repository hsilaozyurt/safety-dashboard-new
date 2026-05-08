/* ================================================================
   Safety Risk Dashboard — dashboard.js
   DATA FLOW FIXED VERSION
   ================================================================ */

(function (window) {
  'use strict';

  var SRD = {};

  /* ──────────────────────────────────────────────────────────────
     MATRIX
  ────────────────────────────────────────────────────────────── */
  var MATRIX = {
    category: function(score) {
      score = Number(score) || 0;

      if (score >= 70) return 'A';
      if (score >= 55) return 'B';
      if (score >= 40) return 'C';
      if (score >= 25) return 'D';
      return 'E';
    },

    color: function(level) {
      level = String(level || '').toUpperCase();

      return {
        A: '#ef4444',
        B: '#f97316',
        C: '#eab308',
        D: '#22c55e',
        E: '#3b82f6'
      }[level] || '#94a3b8';
    }
  };

  /* ──────────────────────────────────────────────────────────────
     HELPERS
  ────────────────────────────────────────────────────────────── */

  function uniq(arr) {
    return Array.from(new Set(arr));
  }

  function detectDelimiter(firstLine) {
    firstLine = String(firstLine || '');

    var commaCount = (firstLine.match(/,/g) || []).length;
    var semicolonCount = (firstLine.match(/;/g) || []).length;
    var tabCount = (firstLine.match(/\t/g) || []).length;

    if (tabCount > commaCount && tabCount > semicolonCount) {
      return '\t';
    }

    return semicolonCount > commaCount ? ';' : ',';
  }

  function splitCSVLine(line, delimiter) {
    var cols = [];
    var cur = '';
    var inQ = false;

    line = String(line || '');

    for (var i = 0; i < line.length; i++) {
      var ch = line[i];

      if (ch === '"') {
        if (inQ && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQ = !inQ;
        }
      }
      else if (ch === delimiter && !inQ) {
        cols.push(cur.trim());
        cur = '';
      }
      else {
        cur += ch;
      }
    }

    cols.push(cur.trim());

    return cols;
  }

  function normalizeHeader(h) {
    return String(h || '')
      .replace(/^\uFEFF/, '')
      .trim();
  }

  function parseCSV(text) {

    text = String(text || '')
      .replace(/^\uFEFF/, '')
      .trim();

    var lines = text.split(/\r?\n/).filter(function(line) {
      return line.trim() !== '';
    });

    if (lines.length < 2) {
      return [];
    }

    var delimiter = detectDelimiter(lines[0]);

    console.log('SRD delimiter:', delimiter);

    var headers = splitCSVLine(lines[0], delimiter)
      .map(normalizeHeader);

    console.log('SRD headers:', headers);

    return lines.slice(1).map(function(line, rowIndex) {

      var cols = splitCSVLine(line, delimiter);

      if (cols.length !== headers.length) {
        console.warn(
          'SRD kolon sayısı uyuşmuyor',
          'satır:',
          rowIndex + 2,
          'header:',
          headers.length,
          'cols:',
          cols.length
        );
      }

      var obj = {};

      headers.forEach(function(h, i) {
        obj[h] = (cols[i] || '').trim();
      });

      return obj;

    }).filter(function(r) {

      return Object.values(r).some(function(v) {
        return v !== '';
      });

    });
  }

  function getVal(row, names) {

    for (var i = 0; i < names.length; i++) {

      var key = names[i];

      if (
        row[key] != null &&
        String(row[key]).trim() !== ''
      ) {
        return row[key];
      }
    }

    var normalized = {};

    Object.keys(row).forEach(function(k) {

      normalized[
        String(k)
          .toLowerCase()
          .replace(/\s+/g, '')
          .replace(/_/g, '')
      ] = row[k];

    });

    for (var j = 0; j < names.length; j++) {

      var n = String(names[j])
        .toLowerCase()
        .replace(/\s+/g, '')
        .replace(/_/g, '');

      if (
        normalized[n] != null &&
        String(normalized[n]).trim() !== ''
      ) {
        return normalized[n];
      }
    }

    return '';
  }

  function toNumber(value) {

    if (value == null) {
      return 0;
    }

    var s = String(value).trim();

    if (!s) {
      return 0;
    }

    /*
      1.234,56
      1,234.56
      1234,56
      1234.56
    */

    if (s.indexOf(',') > -1 && s.indexOf('.') > -1) {

      if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
        s = s.replace(/\./g, '').replace(',', '.');
      }
      else {
        s = s.replace(/,/g, '');
      }
    }
    else if (s.indexOf(',') > -1) {
      s = s.replace(',', '.');
    }

    s = s.replace(/[^0-9.-]/g, '');

    return parseFloat(s) || 0;
  }

  function normalizeLoc(value) {

    return String(value || '')
      .replace(/^\uFEFF/, '')
      .trim()
      .toLocaleUpperCase('en-US');
  }

  function normalizeRegion(value) {

    var s = String(value || '').trim();

    if (!s) {
      return '';
    }

    var match = s.match(/(\d+)\s*\.?\s*(Bölge|Bolge|Region)/i);

    if (match) {
      return match[1] + '. Bölge';
    }

    if (/^\d+$/.test(s)) {
      return s + '. Bölge';
    }

    return s;
  }

  function fmtNum(n, dec) {

    dec = dec == null ? 1 : dec;

    return toNumber(n).toLocaleString('tr-TR', {
      minimumFractionDigits: dec,
      maximumFractionDigits: dec
    });
  }

  function fmtInt(n) {
    return Math.round(toNumber(n)).toLocaleString('tr-TR');
  }

  function loadCSV(path) {

    console.log('SRD loading CSV:', path);

    return fetch(path, {
      cache: 'no-store'
    })
    .then(function(r) {

      if (!r.ok) {
        throw new Error(
          'CSV yüklenemedi: ' +
          path +
          ' HTTP:' +
          r.status
        );
      }

      return r.text();

    })
    .then(parseCSV);
  }

  /* ──────────────────────────────────────────────────────────────
     PROCESS DATA
  ────────────────────────────────────────────────────────────── */

  function processData(incidents, flightRows, spiRows) {

    var flightMap = {};

    flightRows.forEach(function(r) {

      var loc = normalizeLoc(getVal(r, [
        'Loc',
        'LOC',
        'loc',
        'Station',
        'Station_Code',
        'Station Code'
      ]));

      var cnt = toNumber(getVal(r, [
        'Flight Count',
        'Flight_Count',
        'Ucus_Sayisi',
        'Uçuş Sayısı',
        'Ucus Sayisi',
        'flight_count',
        'Flights',
        'Flight'
      ]));

      if (loc) {
        flightMap[loc] = cnt;
      }
    });

    console.log('SRD flightMap:', flightMap);

    var spiMap = {};

    spiRows.forEach(function(r) {

      var code = String(getVal(r, [
        'SPI',
        'SPI_Code',
        'SPI Code'
      ])).trim();

      if (code) {

        spiMap[code] = {

          title: getVal(r, [
            'title',
            'Title',
            'SPI_Title',
            'SPI Title'
          ]) || code,

          cls: getVal(r, [
            'SPI_Class',
            'SPI Class',
            'Class'
          ]) || ''
        };
      }
    });

    console.log('SRD spiMap:', spiMap);

    var rows = incidents.map(function(r) {

      var loc = normalizeLoc(getVal(r, [
        'Loc',
        'LOC',
        'loc',
        'Station',
        'Station_Code',
        'Station Code'
      ]));

      var riskScore = toNumber(getVal(r, [
        'RiskScore',
        'Risk_Score',
        'Risk Score',
        'riskScore',
        'risk_score'
      ]));

      var riskLevel = String(getVal(r, [
        'Risk_Level',
        'RiskLevel',
        'Risk Level',
        'risk_level'
      ])).trim().toUpperCase();

      if (!riskLevel) {
        riskLevel = MATRIX.category(riskScore);
      }

      var nonSPI = String(getVal(r, [
        'NonSPI',
        'Non_SPI',
        'Non SPI'
      ])).toLowerCase();

      var isNonSPI = (
        nonSPI === 'true' ||
        nonSPI === '1' ||
        nonSPI === 'yes' ||
        nonSPI === 'evet'
      );

      var spi1 = String(getVal(r, [
        'SPI_1',
        'SPI1',
        'SPI 1'
      ])).trim();

      var spi2 = String(getVal(r, [
        'SPI2',
        'SPI_2',
        'SPI 2'
      ])).trim();

      var spiTags = [];

      if (!isNonSPI) {

        if (spi1) spiTags.push(spi1);
        if (spi2) spiTags.push(spi2);
      }

      return {

        loc: loc,

        occNo: getVal(r, [
          'Occurence_No',
          'Occurrence_No',
          'Occurrence No',
          'Occurence No'
        ]) || '',

        repType: getVal(r, [
          'Report_type',
          'Report_Type',
          'Report Type',
          'ReportType'
        ]) || '',

        dept: getVal(r, [
          'Department',
          'Dept',
          'Unit'
        ]) || '',

        status: getVal(r, [
          'Status',
          'Durum'
        ]) || '',

        date: getVal(r, [
          'MC_Date',
          'MC Date',
          'Date'
        ]) || '',

        year: getVal(r, [
          'MC_Year',
          'MC Year',
          'Year'
        ]) || '',

        yearMonth: getVal(r, [
          'MC_Year_Month',
          'MC Year Month',
          'Year_Month',
          'YearMonth'
        ]) || '',

        region: normalizeRegion(getVal(r, [
          'Bölge',
          'Bolge',
          'Region',
          'Region_Name',
          'RegionName'
        ])) || '',

        subRegion: getVal(r, [
          'Alt Bölge',
          'Alt_Bolge',
          'Sub_Region',
          'Sub Region',
          'SubRegion'
        ]) || '',

        fleet: getVal(r, [
          'Fleet',
          'Aircraft Fleet'
        ]) || '',

        likelihood: getVal(r, [
          'likelihood',
          'Likelihood'
        ]) || '',

        likelihoodScore: toNumber(getVal(r, [
          'likelihoodScore',
          'LikelihoodScore',
          'likelihood_score',
          'Likelihood Score'
        ])),

        severity: getVal(r, [
          'severity',
          'Severity'
        ]) || '',

        severityScore: toNumber(getVal(r, [
          'severityScore',
          'SeverityScore',
          'severity_score',
          'Severity Score'
        ])),

        riskLevel: riskLevel,
        riskScore: riskScore,
        nonSPI: isNonSPI,
        spiTags: spiTags,

        opPhase: getVal(r, [
          'Operational_Phase',
          'Operational Phase',
          'OpPhase'
        ]) || '',

        flightCount: flightMap[loc] || 0
      };

    }).filter(function(r) {
      return r.loc;
    });

    console.log('SRD processed rows:', rows);

    return {
      rows: rows,
      spiMap: spiMap,
      flightMap: flightMap
    };
  }

  /* ──────────────────────────────────────────────────────────────
     INIT
  ────────────────────────────────────────────────────────────── */

  SRD.init = function(config) {

    config = config || {};

    var root = document.getElementById(
      config.rootId || 'srd-root'
    );

    if (!root) {
      console.error('SRD root bulunamadı');
      return;
    }

    root.innerHTML = `
      <div style="padding:40px;color:white;font-family:Segoe UI">
        Dashboard Loading...
      </div>
    `;

    var incPath = config.incidentsCsv || './data/All_Station_Info.csv';
    var fltPath = config.stationsCsv || './data/Ucus_sayilari.csv';
    var spiPath = config.spiCsv || './data/SPI_kategorileri.csv';

    Promise.all([
      loadCSV(incPath),
      loadCSV(fltPath),
      loadCSV(spiPath)
    ])
    .then(function(all) {

      var incidents = all[0];
      var flights = all[1];
      var spi = all[2];

      console.log('SRD incidents:', incidents.length);
      console.log('SRD flights:', flights.length);
      console.log('SRD spi:', spi.length);

      var processed = processData(
        incidents,
        flights,
        spi
      );

      root.innerHTML = `
        <div style="padding:24px;color:white;font-family:Segoe UI">
          <h1 style="margin-bottom:16px">
            Safety Risk Dashboard
          </h1>

          <div style="
            background:#111827;
            border:1px solid rgba(255,255,255,.1);
            border-radius:14px;
            padding:18px;
            margin-bottom:20px;
          ">
            <div>Total Incident Rows: ${fmtInt(processed.rows.length)}</div>
            <div>Total Stations: ${fmtInt(uniq(processed.rows.map(r => r.loc)).length)}</div>
          </div>

          <div style="
            overflow:auto;
            background:#111827;
            border-radius:14px;
            border:1px solid rgba(255,255,255,.1);
          ">

            <table style="
              width:100%;
              border-collapse:collapse;
              color:white;
            ">
              <thead>
                <tr style="background:#0f172a">
                  <th style="padding:10px;text-align:left">LOC</th>
                  <th style="padding:10px;text-align:left">REGION</th>
                  <th style="padding:10px;text-align:left">RISK</th>
                  <th style="padding:10px;text-align:left">FLIGHTS</th>
                  <th style="padding:10px;text-align:left">STATUS</th>
                </tr>
              </thead>

              <tbody>

                ${processed.rows.slice(0, 100).map(function(r) {

                  return `
                    <tr style="border-top:1px solid rgba(255,255,255,.08)">
                      <td style="padding:10px">${r.loc}</td>
                      <td style="padding:10px">${r.region}</td>
                      <td style="padding:10px">
                        <span style="
                          padding:4px 8px;
                          border-radius:999px;
                          background:${MATRIX.color(r.riskLevel)}22;
                          color:${MATRIX.color(r.riskLevel)};
                          border:1px solid ${MATRIX.color(r.riskLevel)}66;
                          font-weight:700;
                        ">
                          ${r.riskLevel}
                        </span>
                      </td>

                      <td style="padding:10px">
                        ${fmtInt(r.flightCount)}
                      </td>

                      <td style="padding:10px">
                        ${r.status}
                      </td>
                    </tr>
                  `;

                }).join('')}

              </tbody>
            </table>

          </div>
        </div>
      `;

    })
    .catch(function(err) {

      console.error(err);

      root.innerHTML = `
        <div style="
          padding:40px;
          color:#ef4444;
          font-family:Segoe UI
        ">
          <h2>Dashboard Error</h2>

          <div style="margin-top:12px">
            ${err.message}
          </div>

          <div style="margin-top:20px;color:#94a3b8">
            F12 → Console ekranını kontrol et.
          </div>
        </div>
      `;
    });
  };

  window.SRD = SRD;

})(window);