import jsPDF from "jspdf";

const PAGE_MARGIN_X = 48;
const PAGE_MARGIN_TOP = 56;
const PAGE_MARGIN_BOTTOM = 48;
const LINE_HEIGHT = 16;

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

const flattenUnits = (units = [], level = 2, parentName = "") => {
  return units.flatMap((unit) => {
    const current = [{ unit, level, parentName }];
    const nested = flattenUnits(unit.organisations || [], level + 1, safe(unit.name));
    return [...current, ...nested];
  });
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

  const cursor = { y: PAGE_MARGIN_TOP };

  writeLines(doc, [`Organigramm: ${title}`], cursor, {
    fontStyle: "bold",
    fontSize: 18,
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

  if (units.length === 0) {
    writeLines(doc, ["Es wurden keine Organisationseinheiten gefunden."], cursor);
  }

  units.forEach(({ unit, level, parentName }, index) => {
    const headingPrefix = "H".repeat(Math.min(level, 6));
    const unitName = safe(unit?.name) || "Unbenannte Organisationseinheit";

    writeLines(doc, [`${headingPrefix} ${unitName}`], cursor, {
      fontStyle: "bold",
      fontSize: 13,
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

    writeLines(doc, metaLines, cursor, { indent: 8, fontSize: 11, after: 2 });

    if ((unit?.positions || []).length > 0) {
      writeLines(doc, ["Positionen:"], cursor, { indent: 8, fontStyle: "bold", fontSize: 11 });
      (unit.positions || []).forEach((position) => {
        const positionType = safe(position?.positionType) || "Position";
        writeLines(doc, [`- ${positionType}: ${personName(position?.person)}`], cursor, {
          indent: 16,
          fontSize: 11,
        });
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
      (unit.departments || []).forEach((department) => {
        const departmentName = safe(department?.name) || "Unbenannte Einheit";
        const departmentPurpose = safe(department?.purpose);
        const prefix = departmentPurpose
          ? `- ${departmentName}: ${departmentPurpose}`
          : `- ${departmentName}`;
        writeLines(doc, [prefix], cursor, { indent: 16, fontSize: 11 });

        (department?.positions || []).forEach((position) => {
          const positionType = safe(position?.positionType) || "Position";
          writeLines(doc, [`  - ${positionType}: ${personName(position?.person)}`], cursor, {
            indent: 24,
            fontSize: 10,
          });
        });
      });
    }
  });

  doc.save(`${exportFilename}.pdf`);
};
