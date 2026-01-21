import React from "react";
import PropTypes from "prop-types";
import { Button } from "react-bootstrap";
import MDEditor from "@uiw/react-md-editor";
import rehypeSanitize from "rehype-sanitize";
import "./DocumentNodes.scss";

const propTypes = {
  data: PropTypes.shape({
    note: PropTypes.string,
    onOpenDocument: PropTypes.func.isRequired,
  }).isRequired,
};

const DocumentNoteNode = ({ data }) => {
  const { note, onOpenDocument } = data;

  if (!note) {
    return null;
  }

  return (
    <div className="document-node document-note">
      <Button
        className="btn-sm btn-edit btn-secondary"
        onClick={(e) => {
          e.stopPropagation();
          onOpenDocument(true);
        }}
      >
        Bearbeiten
      </Button>
      <MDEditor.Markdown source={note} rehypePlugins={[[rehypeSanitize]]} />
    </div>
  );
};

DocumentNoteNode.propTypes = propTypes;

export default DocumentNoteNode;
