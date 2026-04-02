import jsPDF from "jspdf";

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

const safe = (value) => (typeof value === "string" ? value.trim() : "");

const personName = (person = {}) => {
  const parts = [safe(person.title), safe(person.firstName), safe(person.lastName)]
    .filter(Boolean)
    .join(" ");
  return parts || "Nicht angegeben";
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

export const exportAccessiblePdf = (data, exportFilename) => {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: "a4",
  });

  const title = safe(data?.document?.title) || "Organigramm";
  const version = safe(data?.document?.version);

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

    if ((unit?.positions || []).length > 0) {
      writeLines(doc, ["Positionen:"], cursor, { indent: 8, fontStyle: "bold", fontSize: 11 });
      (unit.positions || []).forEach((position, positionIndex) => {
        const positionType = safe(position?.positionType) || "Position";
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
          const positionType = safe(position?.positionType) || "Position";
          writeLines(
            doc,
            [`${departmentIndex + 1}.${departmentPositionIndex + 1} ${positionType}: ${personName(position?.person)}`],
            cursor,
            {
              indent: 24,
              fontSize: 10,
            }
          );
        });
      });
    }
  });

  if (doc.getNumberOfPages() > 3 && doc.outline?.add) {
    doc.outline.add(null, `Organigramm: ${title}`, { pageNumber: 1 });
    doc.outline.add(null, "Inhaltsverzeichnis", { pageNumber: 1 });
    doc.outline.add(null, "Organisationsstruktur", { pageNumber: 1 });
  }

  doc.save(`${exportFilename}.pdf`);
};
