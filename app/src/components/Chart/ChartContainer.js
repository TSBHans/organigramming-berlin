import React, {
  useState,
  useEffect,
  useRef,
  forwardRef,
  useImperativeHandle,
} from "react";

import { Button, ButtonGroup } from "react-bootstrap";
import PropTypes from "prop-types";
import {
  ReactFlow,
  Background,
  Controls,
  getNodesBounds,
  getViewportForBounds,
} from "reactflow";
import { toPng, toSvg } from "html-to-image";
import jsPDF from "jspdf";
import FlowNode from "./FlowNode";
import DocumentHeaderNode from "./DocumentHeaderNode";
import DocumentNoteNode from "./DocumentNoteNode";
import "reactflow/dist/style.css";
import "./ChartContainer.scss";
import { exportRDF } from "../../services/exportRDF";
import JSONDigger from "../../services/jsonDigger";
import { selectNodeService } from "../../services/service";

import "../../services/registerFiles";

const propTypes = {
  data: PropTypes.object.isRequired,
  pan: PropTypes.bool,
  zoom: PropTypes.bool,
  zoomoutLimit: PropTypes.number,
  zoominLimit: PropTypes.number,
  containerClass: PropTypes.string,
  chartClass: PropTypes.string,
  draggable: PropTypes.bool,
  collapsible: PropTypes.bool,
  multipleSelect: PropTypes.bool,
  onClickNode: PropTypes.func,
  onDragNode: PropTypes.func,
  onClickChart: PropTypes.func,
  sendDataUp: PropTypes.func,
  onContextMenu: PropTypes.func,
  onCloseContextMenu: PropTypes.func,
  onAddInitNode: PropTypes.func,
};

const defaultProps = {
  pan: false,
  zoom: false,
  zoomoutLimit: 0.2,
  zoominLimit: 7,
  containerClass: "",
  chartClass: "",
  draggable: true,
  collapsible: false,
  multipleSelect: false,
};

const a4Dimensions = {
  portrait: { width: 2480, height: 3508 },
  landscape: { width: 3508, height: 2480 },
};

const buildFlowElements = (organisations) => {
  const nodes = [];
  const edges = [];
  const baseX = 280;
  const baseY = 220;

  const walk = (organisation, parentId, level, index) => {
    const position = organisation.layout?.position ?? {
      x: index * baseX,
      y: level * baseY,
    };

    nodes.push({
      id: organisation.id,
      type: "org",
      position,
      data: { organisation },
    });

    if (parentId) {
      edges.push({
        id: `${parentId}-${organisation.id}`,
        source: parentId,
        target: organisation.id,
        type: "smoothstep",
      });
    }

    if (organisation.organisations) {
      organisation.organisations.forEach((child, childIndex) =>
        walk(child, organisation.id, level + 1, childIndex)
      );
    }
  };

  organisations.forEach((organisation, index) =>
    walk(organisation, null, 0, index)
  );

  return { nodes, edges };
};

const ChartContainer = forwardRef(
  (
    {
      data,
      update,
      containerClass,
      chartClass,
      draggable,
      onClickNode,
      onClickChart,
      sendDataUp,
      onContextMenu,
      onCloseContextMenu,
      onOpenDocument,
      onAddInitNode,
    },
    ref
  ) => {
    const container = useRef();
    const reactFlowWrapper = useRef();
    const [nodes, setNodes] = useState([]);
    const [edges, setEdges] = useState([]);
    const [exporting, setExporting] = useState(false);
    const [reactFlowInstance, setReactFlowInstance] = useState(null);

    useEffect(() => {
      const { nodes: flowNodes, edges: flowEdges } = buildFlowElements(
        data.organisations || []
      );

      const headerNode = {
        id: "document-header",
        type: "documentHeader",
        position: { x: 0, y: -240 },
        data: { document: data.document, onOpenDocument },
        draggable: false,
        selectable: false,
      };

      const noteNode = data.document?.note
        ? {
            id: "document-note",
            type: "documentNote",
            position: { x: 0, y: -60 },
            data: { note: data.document.note, onOpenDocument },
            draggable: false,
            selectable: false,
          }
        : null;

      const combinedNodes = noteNode
        ? [headerNode, noteNode, ...flowNodes]
        : [headerNode, ...flowNodes];

      setNodes(combinedNodes);
      setEdges(flowEdges);
    }, [data, update, onOpenDocument]);

    const updateNodePosition = async (nodeId, position) => {
      const dsDigger = new JSONDigger(data, "id", "organisations");
      const organisation = await dsDigger.findNodeById(nodeId);
      const layout = organisation.layout
        ? { ...organisation.layout, position }
        : { style: "default", position };
      organisation.layout = layout;
      sendDataUp({ ...data, organisations: [...data.organisations] });
    };

    const handleNodeClick = (_, node) => {
      if (node.type !== "org") {
        return;
      }
      if (onClickNode) {
        onClickNode(node.data.organisation);
      }
    };

    const handleNodeContextMenu = (event, node) => {
      if (node.type !== "org") {
        return;
      }
      event.preventDefault();
      if (onClickNode) {
        onClickNode(node.data.organisation);
      }
      onContextMenu(event);
    };

    const handlePaneClick = () => {
      if (onClickChart) {
        onClickChart();
      }
      selectNodeService.clearSelectedNodeInfo();
      onCloseContextMenu();
    };

    const resetViewHandler = () => {
      reactFlowInstance?.fitView({ padding: 0.2 });
    };

    const finalizeExport = (includeLogo) => {
      if (!includeLogo) {
        reactFlowWrapper.current?.classList.remove("hide-logo");
      }
      setExporting(false);
    };

    const exportToPng = async (
      exportFilename,
      bounds,
      viewport,
      size,
      includeLogo
    ) => {
      const exportNode = reactFlowWrapper.current.querySelector(
        ".react-flow__viewport"
      );
      const dataUrl = await toPng(exportNode, {
        width: size.width,
        height: size.height,
        backgroundColor: "#ffffff",
        style: {
          width: `${size.width}px`,
          height: `${size.height}px`,
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
        },
      });
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `${exportFilename}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      finalizeExport(includeLogo);
    };

    const exportToSvg = async (
      exportFilename,
      bounds,
      viewport,
      size,
      includeLogo
    ) => {
      const exportNode = reactFlowWrapper.current.querySelector(
        ".react-flow__viewport"
      );
      const dataUrl = await toSvg(exportNode, {
        width: size.width,
        height: size.height,
        backgroundColor: "#ffffff",
        style: {
          width: `${size.width}px`,
          height: `${size.height}px`,
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
        },
      });
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `${exportFilename}.svg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      finalizeExport(includeLogo);
    };

    const exportToPdf = async (
      exportFilename,
      bounds,
      viewport,
      size,
      includeLogo
    ) => {
      const exportNode = reactFlowWrapper.current.querySelector(
        ".react-flow__viewport"
      );
      const dataUrl = await toPng(exportNode, {
        width: size.width,
        height: size.height,
        backgroundColor: "#ffffff",
        style: {
          width: `${size.width}px`,
          height: `${size.height}px`,
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
        },
      });

      const doc = new jsPDF({
        orientation: data.document.paperOrientation,
        unit: "px",
        format: "a4",
      });
      doc.addImage(dataUrl, "PNG", 0, 0, size.width, size.height);
      doc.save(`${exportFilename}.pdf`);
      finalizeExport(includeLogo);
    };

    useImperativeHandle(ref, () => ({
      exportTo: (fileName, fileextension, includeLogo, exportData) => {
        setExporting(true);
        selectNodeService.clearSelectedNodeInfo();
        const exportFilename = fileName || "OrgChart";
        const exportFileExtension = fileextension || "png";
        if (!includeLogo) {
          reactFlowWrapper.current?.classList.add("hide-logo");
        }

        if (exportFileExtension === "rdf") {
          exportRDF(exportData);
          finalizeExport(includeLogo);
          return;
        }

        if (!reactFlowInstance) {
          finalizeExport(includeLogo);
          return;
        }
        const orientation = exportData.document.paperOrientation || "landscape";
        const size =
          orientation === "portrait"
            ? a4Dimensions.portrait
            : a4Dimensions.landscape;
        const flowNodes = reactFlowInstance.getNodes();
        const bounds = getNodesBounds(flowNodes);
        const viewport = getViewportForBounds(
          bounds,
          size.width,
          size.height,
          0.1,
          2
        );

        if (exportFileExtension === "png") {
          exportToPng(exportFilename, bounds, viewport, size, includeLogo);
        } else if (exportFileExtension === "svg") {
          exportToSvg(exportFilename, bounds, viewport, size, includeLogo);
        } else if (exportFileExtension === "pdf") {
          exportToPdf(exportFilename, bounds, viewport, size, includeLogo);
        }
      },
      resetViewHandler: () => {
        resetViewHandler();
      },
      demoDragMode: () => {},
    }));

    const nodeTypes = {
      org: FlowNode,
      documentHeader: DocumentHeaderNode,
      documentNote: DocumentNoteNode,
    };

    return (
      <>
        <div
          ref={container}
          className={
            "view-container " +
            containerClass +
            (exporting ? " exporting" : "")
          }
        >
          <div className="navigation-container">
            <ButtonGroup aria-label="navigation" vertical>
              <Button
                onClick={() => reactFlowInstance?.zoomIn()}
                title="Herein zoomen"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  fill="currentColor"
                  className="bi bi-zoom-in"
                  viewBox="0 0 16 16"
                >
                  <path
                    fillRule="evenodd"
                    d="M6.5 12a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11zM13 6.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0z"
                  />
                  <path d="M10.344 11.742c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1 6.538 6.538 0 0 1-1.398 1.4z" />
                  <path
                    fillRule="evenodd"
                    d="M6.5 3a.5.5 0 0 1 .5.5V6h2.5a.5.5 0 0 1 0 1H7v2.5a.5.5 0 0 1-1 0V7H3.5a.5.5 0 0 1 0-1H6V3.5a.5.5 0 0 1 .5-.5z"
                  />
                </svg>
              </Button>
              <Button
                onClick={() => reactFlowInstance?.zoomOut()}
                title="Heraus zoomen"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  fill="currentColor"
                  className="bi bi-zoom-out"
                  viewBox="0 0 16 16"
                >
                  <path
                    fillRule="evenodd"
                    d="M6.5 12a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11zM13 6.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0z"
                  />
                  <path d="M10.344 11.742c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1 6.538 6.538 0 0 1-1.398 1.4z" />
                  <path
                    fillRule="evenodd"
                    d="M3 6.5a.5.5 0 0 1 .5-.5h6a.5.5 0 0 1 0 1h-6a.5.5 0 0 1-.5-.5z"
                  />
                </svg>
              </Button>

              <Button onClick={resetViewHandler} title="Übersicht">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  fill="currentColor"
                  className="bi bi-arrows-fullscreen"
                  viewBox="0 0 16 16"
                >
                  <path
                    fillRule="evenodd"
                    d="M5.828 10.172a.5.5 0 0 0-.707 0l-4.096 4.096V11.5a.5.5 0 0 0-1 0v3.975a.5.5 0 0 0 .5.5H4.5a.5.5 0 0 0 0-1H1.732l4.096-4.096a.5.5 0 0 0 0-.707zm4.344 0a.5.5 0 0 1 .707 0l4.096 4.096V11.5a.5.5 0 1 1 1 0v3.975a.5.5 0 0 1-.5.5H11.5a.5.5 0 0 1 0-1h2.768l-4.096-4.096a.5.5 0 0 1 0-.707zm0-4.344a.5.5 0 0 0 .707 0l4.096-4.096V4.5a.5.5 0 1 1 1 0V.525a.5.5 0 0 1 .5-.5H11.5a.5.5 0 0 1 0 1h2.768l-4.096 4.096a.5.5 0 0 0 0 .707zm-4.344 0a.5.5 0 0 1-.707 0L1.025 1.732V4.5a.5.5 0 0 1-1 0V.525a.5.5 0 0 1 .5-.5H4.5a.5.5 0 0 1 0 1H1.732l4.096 4.096a.5.5 0 0 1 0 .707z"
                  />
                </svg>
              </Button>
            </ButtonGroup>
          </div>

          <div
            ref={reactFlowWrapper}
            className={
              "editor " + chartClass + (exporting ? " exporting" : "")
            }
          >
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onInit={setReactFlowInstance}
              onNodeClick={handleNodeClick}
              onNodeContextMenu={handleNodeContextMenu}
              onNodeDragStop={(_, node) => {
                if (node.type !== "org") {
                  return;
                }
                updateNodePosition(node.id, node.position);
              }}
              nodeTypes={nodeTypes}
              onPaneClick={handlePaneClick}
              nodesDraggable={draggable}
              fitView
            >
              <Background gap={16} size={1} />
              <Controls showInteractive={false} />
            </ReactFlow>
            {(!data.organisations || data.organisations.length === 0) && (
              <div className="empty-canvas">
                <Button variant="outline-success" onClick={() => onAddInitNode()}>
                  Neue Organisation anlegen
                </Button>
              </div>
            )}
          </div>
        </div>
        <div className={`oc-mask ${exporting ? "" : "hidden"}`}>
          <i className="oci oci-spinner spinner"></i>
        </div>
      </>
    );
  }
);

ChartContainer.propTypes = propTypes;
ChartContainer.defaultProps = defaultProps;

export default ChartContainer;
