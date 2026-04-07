import jsPDF from "jspdf";
import { getGenderedPosition } from "./service";
import typeVocabLookup from "./typeVocabLookup.json";
import rdfVocab from "./rdfVocab.json";

const PAGE_MARGIN_X = 48;
const PAGE_MARGIN_TOP = 56;
const PAGE_MARGIN_BOTTOM = 48;
const LINE_HEIGHT = 16;
const HEADING_FONT_SIZES = {
  1: 19,
  2: 16,
  3: 14,
  4: 13,
  5: 12,
  6: 11,
};
const BERORGS_VOCAB_URL =
  "https://raw.githubusercontent.com/berlin/lod-vocabulary/main/data/berorgs/berorgs.ttl";
let vocabularyCommentCachePromise = null;

const safe = (value) => (typeof value === "string" ? value.trim() : "");

const personName = (person = {}) => {
  const parts = [safe(person.title), safe(person.firstName), safe(person.lastName)]
    .filter(Boolean)
    .join(" ");
  return parts || "Nicht angegeben";
};

const positionTitle = (position = {}) => {
  const rawPositionType = safe(position?.positionType) || "Position";
  return getGenderedPosition(rawPositionType, position?.person?.gender) || rawPositionType;
};

const getVocabularyUri = (prefix, term) => {
  if (!rdfVocab[prefix] || !term) return "";
  return `${rdfVocab[prefix]}${term}`;
};

const organizationVocabularyLines = (org = {}) => {
  const lines = [];
  lines.push("RDF-Typ: org:Organization");
  if (safe(org?.type) && typeVocabLookup[org.type]) {
    const match = typeVocabLookup[org.type];
    lines.push(
      `RDF-Typ (Vokabular): ${match.vocab}:${match.name} (${getVocabularyUri(match.vocab, match.name)})`
    );
  }
  if (safe(org?.uri?.uri)) {
    lines.push(`RDF-Identifikator (@id): ${org.uri.uri}`);
  }
  if (safe(org?.name)) lines.push(`Prädikat skos:prefLabel: ${org.name}`);
  if (safe(org?.altName)) lines.push(`Prädikat skos:altLabel: ${org.altName}`);
  if (safe(org?.purpose)) lines.push(`Prädikat org:purpose: ${org.purpose}`);
  if (safe(org?.contact?.telephone)) lines.push(`Prädikat vcard:tel: ${org.contact.telephone}`);
  if (safe(org?.contact?.fax)) lines.push(`Prädikat vcard:fax: ${org.contact.fax}`);
  if (safe(org?.contact?.email)) lines.push(`Prädikat vcard:email: ${org.contact.email}`);
  if (safe(org?.contact?.website)) lines.push(`Prädikat vcard:url: ${org.contact.website}`);
  if (safe(org?.address?.street) || safe(org?.address?.housenumber)) {
    lines.push("Prädikat org:siteAddress / vcard:street-address vorhanden");
  }
  if (safe(org?.address?.zipCode)) lines.push(`Prädikat vcard:postal-code: ${org.address.zipCode}`);
  if (safe(org?.address?.city)) lines.push(`Prädikat vcard:locality: ${org.address.city}`);
  return lines;
};

const positionVocabularyLines = (position = {}) => {
  const lines = [];
  if (safe(position?.positionType) && typeVocabLookup[position.positionType]) {
    const match = typeVocabLookup[position.positionType];
    lines.push(
      `Prädikat org:role: ${match.vocab}:${match.name} (${getVocabularyUri(match.vocab, match.name)})`
    );
  } else if (safe(position?.positionType)) {
    lines.push(`Prädikat rdfs:label: ${position.positionType}`);
  }
  if (safe(position?.positionStatus)) {
    lines.push(`Prädikat rdfs:comment: ${position.positionStatus}`);
  }
  return lines;
};

const parseVocabularyComments = (turtleText = "") => {
  const commentsByTerm = {};
  const classBlockRegex = /berorgs:([A-Za-z0-9_]+)\s+a\s+owl:Class\s*;([\s\S]*?)\.\s*/g;

  let match;
  while ((match = classBlockRegex.exec(turtleText)) !== null) {
    const term = match[1];
    const block = match[2];
    const germanCommentMatch =
      block.match(/rdfs:comment\s+"""([\s\S]*?)"""@de\s*;/) ||
      block.match(/rdfs:comment\s+"([^"]*)"@de\s*;/);
    if (germanCommentMatch && germanCommentMatch[1]) {
      commentsByTerm[term] = germanCommentMatch[1].trim().replace(/\s+/g, " ");
    }
  }
  return commentsByTerm;
};

const getVocabularyComments = async () => {
  if (!vocabularyCommentCachePromise) {
    vocabularyCommentCachePromise = fetch(BERORGS_VOCAB_URL)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Could not fetch vocabulary (${response.status})`);
        }
        return response.text();
      })
      .then((ttl) => parseVocabularyComments(ttl))
      .catch(() => ({}));
  }
  return vocabularyCommentCachePromise;
};

const contactLines = (contact = {}) => {
  const lines = [];
  if (safe(contact.email)) lines.push(`E-Mail: ${safe(contact.email)}`);
  if (safe(contact.telephone)) lines.push(`Telefon: ${safe(contact.telephone)}`);
  if (safe(contact.fax)) lines.push(`Fax: ${safe(contact.fax)}`);
  if (safe(contact.website)) lines.push(`Webseite: ${safe(contact.website)}`);
  return lines;
};

const addressLine = (address = {}) => {
  const street = [safe(address.street), safe(address.housenumber)].filter(Boolean).join(" ");
  const location = [safe(address.zipCode), safe(address.city)].filter(Boolean).join(" ");
  const building = safe(address.building) ? `Gebäude ${safe(address.building)}` : "";
  const room = safe(address.room) ? `Raum ${safe(address.room)}` : "";
  return [street, building, room, location].filter(Boolean).join(", ");
};

const flattenUnits = (units = [], depth = 0, parentName = "", numbering = []) => {
  return units.flatMap((unit, index) => {
    const currentNumbering = [...numbering, index + 1];
    const current = [{ unit, depth, parentName, numbering: currentNumbering }];
    const nested = flattenUnits(
      unit.organisations || [],
      depth + 1,
      safe(unit.name),
      currentNumbering
    );
    return [...current, ...nested];
  });
};

const headingLevelFromDepth = (depth) => Math.min(2 + depth, 6);

const headingFontSize = (headingLevel) => HEADING_FONT_SIZES[headingLevel] || 11;

const formatHeadingNumber = (headingLevel, numbering = []) => {
  if (headingLevel <= 1 || numbering.length === 0) {
    return "1";
  }
  return `1.${numbering.join(".")}`;
};

const writeLines = (doc, lines, cursor, options = {}) => {
  const font = options.font || "helvetica";
  const fontStyle = options.fontStyle || "normal";
  const fontSize = options.fontSize || 11;
  const indent = options.indent || 0;
  const before = options.before || 0;
  const after = options.after || 0;
  const maxWidth = options.maxWidth || doc.internal.pageSize.getWidth() - PAGE_MARGIN_X * 2;

  cursor.y += before;
  doc.setFont(font, fontStyle);
  doc.setFontSize(fontSize);

  lines.forEach((line) => {
    const wrapped = doc.splitTextToSize(line, maxWidth - indent);
    wrapped.forEach((part) => {
      if (cursor.y > doc.internal.pageSize.getHeight() - PAGE_MARGIN_BOTTOM) {
        doc.addPage();
        cursor.y = PAGE_MARGIN_TOP;
      }
      doc.text(part, PAGE_MARGIN_X + indent, cursor.y);
      cursor.y += LINE_HEIGHT;
    });
  });

  cursor.y += after;
};

export const exportAccessiblePdf = async (data, exportFilename) => {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: "a4",
  });

  const title = safe(data?.document?.title) || "Organigramm";
  const version = safe(data?.document?.version);
  const includeVocabularyDetails = Boolean(data?.export?.includeVocabularyDetails);
  const includeVocabularyComments = Boolean(data?.export?.includeVocabularyComments);
  const vocabularyComments =
    includeVocabularyComments || includeVocabularyDetails
      ? await getVocabularyComments()
      : {};

  doc.setProperties({
    title: `${title} - Barrierefreie Fassung`,
    subject: "Barrierefreies Organigramm",
    author: safe(data?.document?.creator) || "Organigramm Tool Berlin",
    creator: "organigramming-berlin",
    keywords: "Organigramm, Barrierefreiheit, PDF",
  });
  if (typeof doc.setLanguage === "function") {
    doc.setLanguage("de-DE");
  }

  const cursor = { y: PAGE_MARGIN_TOP };

  writeLines(doc, [`1. Organigramm: ${title}`], cursor, {
    fontStyle: "bold",
    fontSize: headingFontSize(1),
    after: 8,
  });

  writeLines(
    doc,
    [
      `Stand: ${version || "Nicht angegeben"}`,
      "Dieses Dokument wurde automatisch aus den Organigramm-Daten erstellt.",
    ],
    cursor,
    { fontSize: 11, after: 12 }
  );

  const units = flattenUnits(data?.organisations || []);

  writeLines(doc, ["1.1 Inhaltsverzeichnis"], cursor, {
    fontStyle: "bold",
    fontSize: headingFontSize(2),
    after: 4,
  });
  writeLines(doc, ["1.1.1 Organisationsstruktur"], cursor, {
    fontStyle: "normal",
    fontSize: headingFontSize(3),
    indent: 8,
    after: 4,
  });
  units.forEach(({ unit, depth, numbering }) => {
    const headingLevel = headingLevelFromDepth(depth);
    const headingNumber = formatHeadingNumber(headingLevel, numbering);
    const unitName = safe(unit?.name) || "Unbenannte Organisationseinheit";
    writeLines(doc, [`${headingNumber} ${unitName}`], cursor, {
      fontSize: 10,
      indent: 16 + depth * 8,
    });
  });
  cursor.y += 8;

  if (units.length === 0) {
    writeLines(doc, ["Es wurden keine Organisationseinheiten gefunden."], cursor);
  }

  writeLines(doc, ["1.2 Organisationsstruktur"], cursor, {
    fontStyle: "bold",
    fontSize: headingFontSize(2),
    after: 4,
  });

  units.forEach(({ unit, depth, parentName, numbering }, index) => {
    const headingLevel = headingLevelFromDepth(depth);
    const headingNumber = formatHeadingNumber(headingLevel, numbering);
    const unitName = safe(unit?.name) || "Unbenannte Organisationseinheit";

    writeLines(doc, [`${headingNumber} ${unitName}`], cursor, {
      fontStyle: "bold",
      fontSize: headingFontSize(headingLevel),
      before: index === 0 ? 0 : 8,
      after: 2,
    });

    const unitType = safe(unit?.type);
    const purpose = safe(unit?.purpose);
    const address = addressLine(unit?.address);

    const metaLines = [
      parentName ? `Übergeordnete Einheit: ${parentName}` : "Übergeordnete Einheit: keine",
      unitType ? `Art: ${unitType}` : "",
      purpose ? `Zusatzbezeichnung: ${purpose}` : "",
      address ? `Anschrift: ${address}` : "",
      ...contactLines(unit?.contact),
    ].filter(Boolean);

    writeLines(doc, metaLines, cursor, { indent: 8, fontSize: 11, after: 4 });

    const childOrganisations = unit?.organisations || [];
    if (childOrganisations.length > 1) {
      const subOrgNames = childOrganisations
        .map((child) => safe(child?.name))
        .filter(Boolean);
      const subOrgText =
        subOrgNames.length > 0
          ? ` Die direkt untergeordneten Einheiten sind: ${subOrgNames.join(", ")}.`
          : "";
      writeLines(
        doc,
        [
          `Diese Organisationseinheit hat ${childOrganisations.length} direkt untergeordnete Organisationseinheiten.${subOrgText}`,
        ],
        cursor,
        {
          indent: 8,
          fontSize: 11,
          after: 2,
        }
      );
    }

    if ((unit?.positions || []).length > 0) {
      writeLines(doc, ["Positionen:"], cursor, { indent: 8, fontStyle: "bold", fontSize: 11 });
      (unit.positions || []).forEach((position, positionIndex) => {
        const positionType = positionTitle(position);
        writeLines(
          doc,
          [`${positionIndex + 1}) ${positionType}: ${personName(position?.person)}`],
          cursor,
          {
          indent: 16,
          fontSize: 11,
          }
        );
        const positionContact = contactLines(position?.person?.contact);
        if (positionContact.length > 0) {
          writeLines(doc, positionContact, cursor, { indent: 24, fontSize: 10 });
        }
        if (includeVocabularyDetails) {
          const vocabLines = positionVocabularyLines(position);
          if (vocabLines.length > 0) {
            writeLines(doc, vocabLines, cursor, { indent: 24, fontSize: 10 });
          }
        }
        if (includeVocabularyComments && typeVocabLookup[position?.positionType]) {
          const vocabTerm = typeVocabLookup[position.positionType].name;
          const comment = vocabularyComments[vocabTerm];
          if (comment) {
            writeLines(doc, [`RDF-Kommentar (${vocabTerm}): ${comment}`], cursor, {
              indent: 24,
              fontSize: 10,
            });
          }
        }
      });
    }

    if ((unit?.departments || []).length > 0) {
      writeLines(doc, ["Zugehörige Einheiten:"], cursor, {
        indent: 8,
        fontStyle: "bold",
        fontSize: 11,
      });
      (unit.departments || []).forEach((department, departmentIndex) => {
        const departmentName = safe(department?.name) || "Unbenannte Einheit";
        const departmentPurpose = safe(department?.purpose);
        const prefix = departmentPurpose
          ? `${departmentIndex + 1}) ${departmentName}: ${departmentPurpose}`
          : `${departmentIndex + 1}) ${departmentName}`;
        writeLines(doc, [prefix], cursor, { indent: 16, fontSize: 11 });

        (department?.positions || []).forEach((position, departmentPositionIndex) => {
          const positionType = positionTitle(position);
          writeLines(
            doc,
            [`${departmentIndex + 1}.${departmentPositionIndex + 1} ${positionType}: ${personName(position?.person)}`],
            cursor,
            {
              indent: 24,
              fontSize: 10,
            }
          );
          if (includeVocabularyDetails) {
            const vocabLines = positionVocabularyLines(position);
            if (vocabLines.length > 0) {
              writeLines(doc, vocabLines, cursor, { indent: 28, fontSize: 10 });
            }
          }
          if (includeVocabularyComments && typeVocabLookup[position?.positionType]) {
            const vocabTerm = typeVocabLookup[position.positionType].name;
            const comment = vocabularyComments[vocabTerm];
            if (comment) {
              writeLines(doc, [`RDF-Kommentar (${vocabTerm}): ${comment}`], cursor, {
                indent: 28,
                fontSize: 10,
              });
            }
          }
        });
      });
    }

    if (includeVocabularyDetails) {
      const orgVocabulary = organizationVocabularyLines(unit);
      if (orgVocabulary.length > 0) {
        writeLines(doc, ["RDF- und Vokabular-Informationen:"], cursor, {
          indent: 8,
          fontStyle: "bold",
          fontSize: 11,
        });
        writeLines(doc, orgVocabulary, cursor, { indent: 16, fontSize: 10, after: 2 });
      }
    }
    if (includeVocabularyComments && typeVocabLookup[unit?.type]) {
      const vocabTerm = typeVocabLookup[unit.type].name;
      const comment = vocabularyComments[vocabTerm];
      if (comment) {
        writeLines(doc, [`RDF-Kommentar (${vocabTerm}): ${comment}`], cursor, {
          indent: 8,
          fontSize: 10,
          after: 2,
        });
      }
    }
  });

  if (doc.getNumberOfPages() > 3 && doc.outline?.add) {
    doc.outline.add(null, `Organigramm: ${title}`, { pageNumber: 1 });
    doc.outline.add(null, "Inhaltsverzeichnis", { pageNumber: 1 });
    doc.outline.add(null, "Organisationsstruktur", { pageNumber: 1 });
  }

  doc.save(`${exportFilename}.pdf`);
};
