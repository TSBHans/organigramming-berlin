import React from "react";
import PropTypes from "prop-types";
import { Button } from "react-bootstrap";
import { formatDate } from "../../services/service";
import "./DocumentNodes.scss";

const propTypes = {
  data: PropTypes.shape({
    document: PropTypes.object.isRequired,
    onOpenDocument: PropTypes.func.isRequired,
  }).isRequired,
};

const DocumentHeaderNode = ({ data }) => {
  const { document, onOpenDocument } = data;

  return (
    <div className="document-node document-header">
      <Button
        className="btn-sm btn-edit btn-secondary"
        onClick={(e) => {
          e.stopPropagation();
          onOpenDocument(true);
        }}
      >
        Bearbeiten
      </Button>
      {document.logo && (
        <img
          id="logo"
          alt="logo"
          style={{ height: "5rem", width: "auto" }}
          src={document.logo}
        />
      )}

      {document.title && (
        <div className="title-content">
          <h1>{document.title}</h1>
          {document.creator && <span>{document.creator}</span>}
          {document.version && <span>{formatDate(document.version)}</span>}
        </div>
      )}
    </div>
  );
};

DocumentHeaderNode.propTypes = propTypes;

export default DocumentHeaderNode;
