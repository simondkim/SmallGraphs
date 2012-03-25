require([
        "order!jquery",
        "smallgraph/main",
        "d3.AMD",
        "order!jquery-ui",
        "order!jquery.svg",
        "order!jquery.svgdom",
        "order!jquery.cookie",
        "order!less"
        ], function($, smallgraph, d3) {

var SVGNameSpace = "http://www.w3.org/2000/svg";
var MouseMoveThreshold = 5;
var NodeWidth  = 40;//px
var NodeHeight = 20;//px
var NodeLabelLeft = 0;//px
var NodeLabelTop  = 5;//px
var NodeRounding = 10;//px
var EdgeMarkerSize = 12;//px
var EdgeLabelLeft = 0;//px
var EdgeLabelTop  = 10;//px
var EntryWidth  = 70/2;//px
var EntryHeight = 25/2;//px

var ResultPageSize = 250;//results
var ResultScale    = 0.7;//ratio
var ResultPaddingH = 0.2;//ratio
var ResultPaddingV = 0.2;//ratio
var ResultUpdateTransitionDuration = 1000;//ms

var ResultFillColors = [
  "#eb912b",
  "#7099a5",
  "#c71f34",
  "#1d437d",
  "#e8762b",
  "#5b6591",
  "#59879b",
];

// TODO ordinal types

// quantitative types
var QuantitativeTypes = {
  "xsd:decimal": parseInt,
  "xsd:integer": parseInt,
  "xsd:float":  parseFloat,
  "xsd:double": parseFloat,
};
// TODO more types: ordinal, nominal, temporal, geospatial, ...

var Identity = function(x) { return x; };


////////////////////////////////////////////////////////////////////////////////
// some UI vocabularies

function smallgraphsShowDialog(selector, options, msg) {
  var dialog = $(selector).dialog($.extend({
        modal: true,
        width:  document.body.offsetWidth  * (1-.618),
        height: document.body.offsetHeight * (1-.618),
      }, options));
  dialog.find(".description").html(msg);
  return dialog;
}

function smallgraphsShowError(msg) {
  smallgraphsShowDialog("#error-dialog", {
        title: "Error",
        buttons: [ { text: "OK", click: function() {
              $(this).dialog("close");
            }} ],
      }, msg);
}


////////////////////////////////////////////////////////////////////////////////
// graph schema/ontology

// label for atribute nodes
var LabelForType = {
  "xsd:string"  : "abc",
  "xsd:decimal" : "#",
  "xsd:integer" : "#",
  "xsd:float"   : "#.#",
  "xsd:double"  : "#.###",
  "xsd:boolean" : "y/n",
  "xsd:anyURI"  : "URI",
  "xsd:date"    : "📅",
  "xsd:dateTime": "📅⏰",
  "xsd:time"    : "⏰",
};

// known types of nodes
var NodeTypes = [];

// try retreiving graph URL from cookie
var smallgraphsGraphURL;
var smallgraphsGraphURLHistory;
try {
  smallgraphsGraphURLHistory = JSON.parse($.cookie("smallgraphsGraphURLHistory"));
  if (smallgraphsGraphURLHistory == null)
    smallgraphsGraphURLHistory = [];
} catch (err) {
  smallgraphsGraphURLHistory = [];
}
smallgraphsGraphURL = smallgraphsGraphURLHistory[0];

function smallgraphsShowGraphURLPicker() {
  function finishGraphURLInput() {
    var newURL = $("#graph-url-input").val();
    if (newURL != smallgraphsGraphURL) {
      smallgraphsGraphURL = newURL;
      smallgraphsLoadSchema();
    }
  }
  // show dialog for choosing target graph
  var urlDialog = smallgraphsShowDialog("#graph-url-dialog", {
        title: "Choose the Graph to Explore",
        width:  400,
        height: 200,
        resizable: false,
        buttons: {
            "Continue Disconnected": function() {
                $(this).dialog("close");
                smallgraphsResetSchema();
              },
            "Connect": function() {
                $(this).dialog("close");
                finishGraphURLInput();
              },
          },
        close: function() { $("#graph-url-input").blur(); },
    });
  // populate graph url history for autocomplete
  $("#graph-url-input")
    .val(smallgraphsGraphURL || "http://localhost:53411/")
    .keyup(function() {
        switch (event.keyCode) {
          case 14: // enter
          case 13: // return
            $(urlDialog).dialog("close");
            finishGraphURLInput();
            break;
        }
      })
    .autocomplete({
      delay: 0,
      minLength: 0,
      source: smallgraphsGraphURLHistory,
    });
}
$("#graph-url").click(smallgraphsShowGraphURLPicker);

// retreive schema, e.g. edge limiting allowed types of source/target nodes and vice versa
var emptySchema = { Namespaces: {}, Objects: {}, TypeLabels: {} };
var smallgraphsGraphSchema = emptySchema;
var smallgraphsOriginalTitle = document.title;
var smallgraphsGraphURLOriginalMessage = $("#graph-url").html();
function smallgraphsResetSchema() {
  sketchpadClearSketch();
  $("#graph-url").html(smallgraphsGraphURLOriginalMessage);
  smallgraphsGraphSchema = emptySchema;
  NodeTypes = [];
}
function smallgraphsLoadSchema() {
  console.log("loading graph", smallgraphsGraphURL);
  document.title = smallgraphsOriginalTitle +" of "+ smallgraphsGraphURL; // TODO use friendlier name/label of graph
  $("#graph-url").text(smallgraphsGraphURL);
  $.getJSON(smallgraphsGraphURL + "/schema", function(schema) {
        // record the URL in history
        smallgraphsGraphURLHistory = removeAll(smallgraphsGraphURLHistory, [smallgraphsGraphURL]);
        smallgraphsGraphURLHistory.unshift(smallgraphsGraphURL);
        $.cookie("smallgraphsGraphURLHistory", JSON.stringify(smallgraphsGraphURLHistory));
        // clear sketch
        sketchpadClearSketch();
        // switch schema
        smallgraphsGraphSchema = schema;
        // learn nodes types
        NodeTypes = [];
        for (var objName in schema.Objects)
          NodeTypes.push(objName);
        NodeTypes.sort();
        // learn labels for types
        $.extend(LabelForType, schema.TypeLabels);
        // augment with an inverted index of links between objects
        for (var objType in schema.Objects) {
          var links = schema.Objects[objType].Links;
          for (var lnType in links) {
            var targetObjTypes = links[lnType];
            for (var i in targetObjTypes) {
              var targetObjType = targetObjTypes[i];
              var targetObjSchema = schema.Objects[targetObjType];
              if (targetObjSchema.RevLinks == null)
                targetObjSchema.RevLinks = {};
              if (targetObjSchema.RevLinks[lnType] == null)
                targetObjSchema.RevLinks[lnType] = [];
              targetObjSchema.RevLinks[lnType].push(objType);
            }
          }
        }
      })
    .error(function(err) {
        console.log("Error while loading graph schema", smallgraphsGraphURL, err);
        smallgraphsShowError("Could not load graph schema from: " + smallgraphsGraphURL);
        smallgraphsResetSchema();
      })
    ;
}

if (smallgraphsGraphURL != null)
  smallgraphsLoadSchema();
else
  smallgraphsShowGraphURLPicker();


////////////////////////////////////////////////////////////////////////////////

var nodeId = 0;
function createNode(x, y, w, h, nr) {
  if ( w == null)  w = NodeWidth;
  if ( h == null)  h = NodeHeight;
  if (nr == null) nr = NodeRounding;
  var node = addToSketchpad("g", {
      class: "node",
      transform: translate(x, y),
    });
  node.id = "n" + nodeId++;
  node.x = x; node.y = y;
  node.w = w; node.h = h;
  addToSketchpad("rect", {
         rx: nr ,     ry: nr ,
          x: -w ,      y: -h ,
      width: w*2, height: h*2,
    }, node);
  addToSketchpad("text", {
      dx: NodeLabelLeft, dy: NodeLabelTop,
    }, node);
  return node;
}

function getNode(e) {
  if ($(e.parentNode).hasClass("node"))
    return e.parentNode;
  return null;
}
function getEdge(e) {
  if ($(e.parentNode).hasClass("edge"))
    return e.parentNode;
  return null;
}

function keySet(obj) {
  var keys = [];
  for (var key in obj)
    keys.push(key);
  return keys.sort();
}

function removeAll(allElements, elementsToRemove) {
  if (!elementsToRemove || elementsToRemove.length == 0)
    return allElements;
  return allElements.filter(function(n) { return (elementsToRemove.indexOf(n) == -1) });
}

function intersection(a, b) {
  // TODO obviously there's a better implementation of this
  return removeAll(a, removeAll(a, b));
}

function attributeNodeLabelForType(xsdType) {
  var label = LabelForType[xsdType];
  return label ? label : xsdType;
}

////////////////////////////////////////////////////////////////////////////////
// transforms, coordinates stuff

function translate(x,y) {
  return "translate("+ x +","+ y +")";
}

function pathbox(x1,y1, x2,y2) {
  return "M"+x1+" "+y1+" "+
         "L"+x2+" "+y1+" "+
         "L"+x2+" "+y2+" "+
         "L"+x1+" "+y2+" "+
         "Z";
}

function updateEdgeCoordinates(e, x2, y2) {
  var r = Math.sqrt(x2*x2 + y2*y2);
  var x1 = r < e.source.w ? 0 : e.source.w * x2/r;
  var y1 = r < e.source.h ? 0 : e.source.h * y2/r;
  var dx2 = (EdgeMarkerSize + e.target.w) * x2/r;
  var dy2 = (EdgeMarkerSize + e.target.h) * y2/r;
  $("line", e).attr({
      x1: x1     , y1: y1     ,
      x2: x2 -dx2, y2: y2 -dy2,
    });
  $("text", e).attr({ x : x2 / 2, y : y2 / 2 });
}

function adjustEdgeLayout() {
  for (var i = 0; i < arguments.length; i++) {
    var e = arguments[i];
    // adjust transformation based on source.x/y
    $(e).attr({
        transform: translate(e.source.x, e.source.y),
      });
    // then update the edge end point coordinates based on target.x/y
    updateEdgeCoordinates(e, e.target.x - e.source.x, e.target.y - e.source.y);
  }
}

////////////////////////////////////////////////////////////////////////////////
// sketchpad
var sketchpad = $("#query-sketchpad")[0];
var sketchpadDoc = sketchpad.ownerDocument;
var sketchpadPageLeft;
var sketchpadPageTop;
var sketchpadSelectionBox = $("#query-sketchpad-selectionbox")[0];
var sketchpadPhantomNode = $("#query-sketchpad-phantom-node")[0];
$("rect", sketchpadPhantomNode)
  .attr({
      x: -NodeWidth /2,
      y: -NodeHeight/2,
      width : NodeWidth,
      height: NodeHeight,
    })
  ;
$(sketchpad).bind("selectstart", function() { event.preventDefault(); });
var sketch = $("#query-sketch")[0];

function addToSketchpad(name, attrs, target) {
  var node = sketchpadDoc.createElementNS(SVGNameSpace, name);
  $(node).attr(attrs);
  if (target)
    target.appendChild(node);
  else {
    // place nodes before edges, so that edges are rendered on top of them
    if (name == "g" && attrs.class == "node")
      sketch.insertBefore(node, sketch.firstChild);
    else
      sketch.appendChild(node);
  }
  return node;
}

function sketchpadClearSketch() {
  nodeId = edgeId = 0;
  // TODO warn user if there's a sketch being deleted
  $("*", sketch).remove();
}

function attributeNodesOf(n) {
  return $(".attribute.node", sketch)
    .filter(function(attrNode) { return this.subjectId == n.id; })
    ;
}

var queryTypeEntryHandler = null;
var queryTypeEntryWasBlurred = null;
var borderWithPadding = 3;//px XXX bad hard coding the border width and padding size of input
$("#query-type-input")
  .css({
      width:  (EntryWidth -borderWithPadding)*2+"px",
      height: (EntryHeight-borderWithPadding)*2+"px",
    })
  .keyup(function() {
      switch (event.keyCode) {
        case 27: // esc
          this.value = "";
          event.preventDefault(); // esc causes bad thing sometime, e.g. exiting full screen mode, etc.
          break;
        case 14: // enter
        case 13: // return
          break;
        default:
          return;
      }
      queryTypeEntryHandler(this.value);
      queryTypeEntryHandler = null;
      $("#query-type-entry").removeClass("active");
      this.blur();
    })
  .focus(function() {
      if (queryTypeEntryWasBlurred)
        queryTypeEntryWasBlurred = clearTimeout(queryTypeEntryWasBlurred);
    })
  .blur(function() {
      if (queryTypeEntryHandler)
        queryTypeEntryWasBlurred = setTimeout(function() {
            if (queryTypeEntryHandler)
              queryTypeEntryHandler();
            queryTypeEntryHandler = null;
            $("#query-type-entry").removeClass("active");
          }, 200);
    })
  ;

function queryTypeEntryShow(x, y, list, done) {
  if (queryTypeEntryWasBlurred)
    queryTypeEntryWasBlurred = clearTimeout(queryTypeEntryWasBlurred);
  if (queryTypeEntryHandler)
    queryTypeEntryHandler();
  queryTypeEntryHandler = done;
  $("#query-type-input").autocomplete({
      delay: 0,
      minLength: 0,
      source: list,
    });
  $("#query-type-entry")
    .css({
        left: x,
        top:  y,
      })
    .addClass("active")
    ;
  var input = $("#query-type-input")[0];
  if (list.length == 1)
    input.value = list[0];
  else if (list.indexOf(input.value) < 0)
    input.value = "";
  setTimeout(function() {
      input.focus();
      input.select();
    }, 1);
}

////////////////////////////////////////////////////////////////////////////////
// sketchpad actions
var sketchpadAction_AddNode = {
  name: "add node",
  click: function() {
    if (event.target == sketchpad) {
      // create node
      var node = createNode(event.offsetX, event.offsetY);
      // ask user to choose type
      queryTypeEntryShow(
          sketchpad.offsetLeft + event.offsetX -EntryWidth ,
          sketchpad.offsetTop  + event.offsetY -EntryHeight,
          NodeTypes, function(type) {
            if (type) {
              node.objectType = type;
              $("text", node).text(type);
              if (smallgraphsGraphSchema !== emptySchema)
                // show whether edge is invalid or not
                if (NodeTypes.indexOf(type) == -1)
                  $(node).addClass("invalid");
                else
                  $(node).removeClass("invalid");
              console.log("added node", type, node);
            } else {
              // cancel node creation
              $(node).remove();
            }
          });
      return false;
    }
  },
};

var sketchpadAction_MoveNode = {
  name: "move node",
  mousedown: function() {
    // TODO move all selected nodes
    var n = getNode(event.target);
    if (n) {
      this.node = n;
      this.offsetX = event.pageX - sketchpadPageLeft - parseInt(n.x);
      this.offsetY = event.pageY - sketchpadPageTop  - parseInt(n.y);
      var starting = [];
      var ending = [];
      $(".edge", sketchpad).each(function(i, e) {
          if (e.source == n) {
            starting.push(e);
          } else if (e.target == n) {
            ending.push(e);
          }
        });
      this.edgesStarting = starting;
      this.edgesEnding = ending;
      return this;
    }
  },
  mousemove: function() {
    var x = event.pageX - sketchpadPageLeft - this.offsetX;
    var y = event.pageY - sketchpadPageTop  - this.offsetY;
    this.node.x = x;
    this.node.y = y;
    $(this.node).attr({
      transform: translate(x, y),
    });
    // move edges together
    this.edgesStarting.forEach(function(e) {
        $(e).attr({ transform: translate(x,y) });
        var x2 = e.target.x - x;
        var y2 = e.target.y - y;
        updateEdgeCoordinates(e, x2, y2);
      });
    this.edgesEnding.forEach(function(e) {
        var x2 = x - e.source.x;
        var y2 = y - e.source.y;
        updateEdgeCoordinates(e, x2, y2);
      });
  },
};

var EdgeAttributeMark = "@";
var EdgeReverseMark = "^";
function prefixAttributeMark(t) { return EdgeAttributeMark+t; }
function prefixReverseMark(t) { return EdgeReverseMark+t; }
var nullNode = { w: 0, h: 0 };
var emptyObjectSchema = { Links: {}, Attributes: {}, RevLinks: {} }
var edgeId = 0;
var sketchpadAction_DrawEdgeFromANode = {
  name: "draw edge from a node",
  mousedown: function() {
    var n = getNode(event.target);
    if (n) {
      if (n.isAttributeNode) // preventing edges being created from attribute nodes
        return null;
      // create edge
      this.sx = parseInt(n.x);
      this.sy = parseInt(n.y);
      var e = this.edge = addToSketchpad("g", {
          class: "edge",
          transform: translate(this.sx, this.sy),
        });
      e.id = "e"+edgeId++;
      e.source = n;
      e.target = null;
      this.line = $(addToSketchpad("line", {
          x1: 0, y1: 0,
          x2: 0, y2: 0,
        }, e));
      this.label = $(addToSketchpad("text", {
          dx: EdgeLabelLeft, dy: EdgeLabelTop,
        }, e));
      $(e).addClass("drawing");
      // prepare related schema for this source node
      this.objectSchema = (smallgraphsGraphSchema.Objects || {})[n.objectType] || emptyObjectSchema;
      this.allowedEdgeTypes = (
          // outgoing edges
          keySet(this.objectSchema.Links)
        ).concat(
          // incoming edges
          keySet(this.objectSchema.RevLinks)
            // prefix with reverse edge marks
            .map(prefixReverseMark)
        ).concat(
          // attribute edges
          removeAll(
          keySet(this.objectSchema.Attributes)
              // exclude label attribute
              , this.objectSchema.Label == null ? [] : [this.objectSchema.Label])
            // prefix with attribute marks
            .map(prefixAttributeMark)
        );
      return this;
    }
  },
  mousemove: function() {
    // drawing edge
    var tx = event.offsetX;
    var ty = event.offsetY;
    var n = getNode(event.target);
    if (n) {
      if (n == this.edge.source) { // disallowing self/reflexive/recursive edges
        n = null; 
      } else if (n.isAttributeNode) { // preventing edges being created to existing attribute nodes
        n = null;
      }
    }
    var e = this.edge;
    var x2 = tx - this.sx;
    var y2 = ty - this.sy;
    if (n) { // pointing on a node
      e.target = n;
      // hide phantom node
      $(sketchpadPhantomNode).removeClass("active");
      $("rect", sketchpadPhantomNode).attr({ width : 0, height: 0 });
      // attract end of edge to the node
      x2 = n.x - this.sx;
      y2 = n.y - this.sy;
      // check graph schema to find types of allowed edges
      var targetObjectSchema = smallgraphsGraphSchema.Objects[n.objectType] || emptyObjectSchema;
      var allowedEdgeTypesToTarget = (
          intersection(keySet( this.objectSchema.Links),
                       keySet(targetObjectSchema.RevLinks))
        ).concat(
          intersection(keySet( this.objectSchema.RevLinks),
                       keySet(targetObjectSchema.Links))
            .map(prefixReverseMark)
        );
      this.allowedEdgeTypesToTarget = allowedEdgeTypesToTarget;
      if (smallgraphsGraphSchema !== emptySchema)
        // show whether edge is invalid or not
        if (allowedEdgeTypesToTarget.length == 0)
          $(e).addClass("invalid");
        else
          $(e).removeClass("invalid");
    } else { // not pointing on a node
      e.target = nullNode;
      // calculate some length for displacing the phantom node from cursor
      var r = Math.sqrt(x2*x2 + y2*y2);
      var dx = x2/r * (NodeWidth /2 + EdgeMarkerSize);
      var dy = y2/r * (NodeHeight/2 + EdgeMarkerSize);
      // show phantom node
      $("rect", sketchpadPhantomNode)
        .attr({
          width: NodeWidth, height: NodeHeight,
          transform: translate(tx+dx, ty+dy),
        })
        ;
      sketchpadPhantomNode.x = tx + x2/r * (NodeWidth /2);
      sketchpadPhantomNode.y = ty + y2/r * (NodeHeight/2);
      $(sketchpadPhantomNode).addClass("active");
      if (smallgraphsGraphSchema !== emptySchema)
        // show whether edge is invalid or not
        if (this.allowedEdgeTypes.length == 0)
          $(e).addClass("invalid");
        else
          $(e).removeClass("invalid");
    }
    updateEdgeCoordinates(e, x2, y2);
  },
  mouseup: function() {
    var e = this.edge;
    var n = getNode(event.target);
    var lx = sketchpad.offsetLeft + this.sx + parseInt(this.label.attr("x")) -EntryWidth ;
    var ly = sketchpad.offsetTop  + this.sy + parseInt(this.label.attr("y")) -EntryHeight;
    if (n == this.edge.source) { // disallowing self/reflexive/recursive edges
      // hide phantom node
      $(sketchpadPhantomNode).removeClass("active");
      $("rect", sketchpadPhantomNode).attr({ width : 0, height: 0 });
      // cancel edge
      $(e).remove();
    } else if (n && !n.isAttributeNode) { // finish edge to the target
      e.target = n;
      var allowedEdgeTypesToTarget = this.allowedEdgeTypesToTarget;
      // ask user to choose type
      queryTypeEntryShow(
          lx, ly,
          allowedEdgeTypesToTarget,
          function(type) {
            if (type) {
              // show whether the edge is valid or not
              if (smallgraphsGraphSchema !== emptySchema)
                if (allowedEdgeTypesToTarget.indexOf(type) == -1)
                  $(e).addClass("invalid");
                else
                  $(e).removeClass("invalid");
              // reverse the edge if needed
              if (type.substring(0, EdgeReverseMark.length) == EdgeReverseMark) {
                type = type.substring(EdgeReverseMark.length); // get the proper type name
                var node = e.target;
                e.target = e.source;
                e.source = node;
                adjustEdgeLayout(e);
              }
              e.linkType = type;
              $("text", e).text(type);
              $(e).removeClass("drawing");
              console.log("added edge", type, e);
            } else {
              // cancel edge creation
              $(e).remove();
            }
          });
    } else { // add both a node and an edge to it
      var objSchema = this.objectSchema;
      var tx = sketchpadPhantomNode.x;
      var ty = sketchpadPhantomNode.y;
      queryTypeEntryShow(
          lx, ly,
          this.allowedEdgeTypes,
          function(type) {
            // hide phantom node
            $(sketchpadPhantomNode).removeClass("active");
            $("rect", sketchpadPhantomNode).attr({ width : 0, height: 0 });
            if (type) {
              if (type.substring(0, EdgeAttributeMark.length) == EdgeAttributeMark) {
                // add an attribute node
                type = type.substring(EdgeAttributeMark.length); // get the proper type name
                var attrNode = createNode(
                    tx, ty,
                    NodeWidth/2, NodeHeight/2,
                    0
                  );
                $(attrNode).addClass("attribute");
                if ($(e.source).hasClass("aggregate"))
                  $(attrNode).addClass("aggregate");
                attrNode.subjectId = e.source.id;
                attrNode.attributeName = type;
                attrNode.attributeType = objSchema.Attributes[type];
                $("text", attrNode).text(attributeNodeLabelForType(objSchema.Attributes[type]));
                attrNode.isAttributeNode = true;
                // finish attribute edge
                e.target = attrNode;
                adjustEdgeLayout(e);
                e.linkType = type;
                $(e).addClass("attribute");
                $("text", e).text(type);
                $(e).removeClass("drawing");
                if (smallgraphsGraphSchema !== emptySchema)
                  // show whether the attribute node and edge is valid or not?
                  if (attrNode.attributeType == null) {
                    $(attrNode).addClass("invalid");
                    $(e).addClass("invalid");
                  } else {
                    $(attrNode).removeClass("invalid");
                    $(e).removeClass("invalid");
                  }
                console.log("added attribute edge", type, e);
              } else {
                // create a node at the end
                var node = createNode(tx, ty);
                var allowedNodeTypes;
                if (type.substring(0, EdgeReverseMark.length) == EdgeReverseMark) {
                  type = type.substring(EdgeReverseMark.length); // get the proper type name
                  // reverse the edge
                  e.target = e.source;
                  e.source = node;
                  // find out what types of node can come as a source
                  allowedNodeTypes = objSchema.RevLinks[type];
                } else {
                  // e.source remains the same
                  e.target = node;
                  // find out what types of node can come as a target
                  allowedNodeTypes = objSchema.Links[type];
                }
                adjustEdgeLayout(e);
                e.linkType = type;
                $("text", e).text(type);
                $(e).removeClass("drawing");
                // and show whether the edge can be valid or not
                if (allowedNodeTypes == null || allowedNodeTypes.length == 0) {
                  if (smallgraphsGraphSchema !== emptySchema)
                    $(e).addClass("invalid");
                  // if edge itself is invalid, any node can come at the end
                  allowedNodeTypes = NodeTypes;
                } else
                  $(e).removeClass("invalid");
                // ask user to choose what type of node should be added
                setTimeout(function() {
                  queryTypeEntryShow(
                      sketchpad.offsetLeft + tx -EntryWidth ,
                      sketchpad.offsetTop  + ty -EntryHeight,
                      allowedNodeTypes.sort(), function(nodeType) {
                        if (nodeType) {
                          // create node
                          node.objectType = nodeType;
                          $("text", node).text(nodeType);
                          if (smallgraphsGraphSchema !== emptySchema)
                            // show whether node and edge are invalid or not
                            if (allowedNodeTypes.indexOf(nodeType) == -1) {
                              // edge is invalid if this type of node is not allowed
                              $(e).addClass("invalid");
                              // but the node can still be a valid one
                              if (NodeTypes.indexOf(nodeType) == -1)
                                $(node).addClass("invalid");
                              else
                                $(node).removeClass("invalid");
                            } else
                              $(node).removeClass("invalid");
                          console.log("added edge", type, e, "with a node", nodeType, node);
                        } else {
                          // cancel node creation
                          $(node).remove();
                          // and also the edge creation
                          $(e).remove();
                        }
                      });
                }, 100);
              }
            } else {
              // cancel edge creation
              $(e).remove();
            }
          });
    }
  },
};


var sketchpadCurrentSelection = [];
var sketchpadAction_SelectNodeOrEdge = {
  name: "select node or edge",
  click: function() {
    var nodeOrEdge = getNode(event.target) || getEdge(event.target);
    if (nodeOrEdge) {
      var isDoingMultipleSelection = event.metaKey || event.ctrlKey;
      if (isDoingMultipleSelection) {
        if ($(nodeOrEdge).hasClass("selected")) {
          removeAll(sketchpadCurrentSelection, [nodeOrEdge]);
          $(nodeOrEdge).removeClass("selected");
        } else {
          $(nodeOrEdge).addClass("selected");
          sketchpadCurrentSelection.push(nodeOrEdge);
        }
      } else {
        $(sketchpadCurrentSelection).removeClass("selected");
        sketchpadCurrentSelection = [];
        $(nodeOrEdge).addClass("selected");
        sketchpadCurrentSelection.push(nodeOrEdge);
      }
    }
    return false;
  },
};

var sketchpadAction_SelectArea = {
  name: "select area",
  mousedown: function() {
    if (event.target == sketchpad) {
      var x1 = this.x1 = event.offsetX;
      var y1 = this.y1 = event.offsetY;
      this.rect = $("rect", sketchpadSelectionBox)
        .attr({ x: x1, y: y1, width: 0, height: 0 });
      $(sketchpadSelectionBox).addClass("active");
      // TODO invert selection? or exclude range from current selection?
      // incremental selection
      var isDoingMultipleSelection = event.metaKey || event.ctrlKey;
      if (isDoingMultipleSelection) {
        this.initialSelection = sketchpadCurrentSelection;
      } else {
        $(sketchpadCurrentSelection).removeClass("selected");
        sketchpadCurrentSelection = this.initialSelection = [];
      }
      this.lastNodesInBox = [];
      return this;
    }
  },
  mousemove: function() {
    var x1 = this.x1;
    var y1 = this.y1;
    var x2 = event.pageX - sketchpadPageLeft;
    var y2 = event.pageY - sketchpadPageTop;
    this.rect.attr({
        x: Math.min(x1, x2),
        y: Math.min(y1, y2),
        width:  Math.abs(x2 - x1),
        height: Math.abs(y2 - y1),
      });
    // update selection
    var xl = Math.min(x1,x2);
    var xu = Math.max(x1,x2);
    var yl = Math.min(y1,y2);
    var yu = Math.max(y1,y2);
    var nodesInBox = $(".node", sketchpad)
      .filter(function(i) {
          var x = this.x;
          var y = this.y;
          return (xl <= x && x <= xu &&
                  yl <= y && y <= yu);
        })
      .addClass("selected")
      .toArray()
      ;
    var nodesOutOfBoxNow = removeAll(this.lastNodesInBox, nodesInBox.concat(this.initialSelection));
    $(nodesOutOfBoxNow).removeClass("selected");
    //console.debug(nodesInBox.length, nodesOutOfBoxNow.length);
    this.lastNodesInBox = nodesInBox;
    sketchpadCurrentSelection = this.initialSelection.concat(nodesInBox);
  },
  mouseup: function() {
    $(sketchpadSelectionBox).removeClass("active");
    this.rect.attr({ width: 0, height: 0 });
  }
};

var sketchpadAction_RemoveSelection = {
  name: "remove selection",
  keypress: function() {
    function alsoRemoveTargetAttributeNodes() {
      if (this.target && this.target.isAttributeNode)
        $(this.target).remove();
    }
    // first, remove edges that will become dangling by removing the selection
    // along with the attribute nodes without its edge
    $(".edge", sketchpad).filter(function() {
        return (sketchpadCurrentSelection.indexOf(this.source) >= 0 ||
                sketchpadCurrentSelection.indexOf(this.target) >= 0);
      })
      .each(alsoRemoveTargetAttributeNodes)
      .remove();
    // then, remove the selection
    $(sketchpadCurrentSelection)
      .each(alsoRemoveTargetAttributeNodes)
      .remove();
    sketchpadCurrentSelection = [];
  },
};


var constraintInputPrototype;
function sketchpadSetupConstraint(nodes) {
}
function sketchpadSetupConstraintForSelection() {
}

var sketchpadAction_AddConstraint = {
  name: "add constraints",
  // TODO
};

$("#query-constraint")
  .button()
  .click(sketchpadSetupConstraintForSelection)
  ;


var aggregationSelectionPrototype;
aggregationSelectionPrototype = {};
$("#aggregation-list li").each(function() {
      aggregationSelectionPrototype[$(this).attr("for")] = this;
    })
  .remove()
  ;
function sketchpadSetupAggregation(attrNodes) {
  if (attrNodes.length == 0) {
    aggregationSetupInProgress = false;
    return;
  }
  aggregationSetupInProgress = true;
  var agglst = $("#aggregation-list");
  // prepare the form
  $("li", agglst).remove();
  var idx = 0;
  attrNodes.forEach(function(attrNode) {
      var dataType = QuantitativeTypes[attrNode.attributeType] != null ? "Quantitative" : "Ordinal"; // TODO Nominal types?
      var listitem = $(aggregationSelectionPrototype[dataType]).clone();
      listitem[0].attributeNode = attrNode;
      var newId = $("label", listitem).attr("for").replace(/\d+$/, idx++);
      $("label", listitem)
        .attr({
            for: newId,
          })
        .text(
            $("#"+attrNode.subjectId +" text", sketch).text() +" "+
            prefixAttributeMark(attrNode.attributeName)
          )
        ;
      $("select", listitem)
        .attr("id", newId)
        .val(attrNode.aggregateFunction)
        ;
      attrNode.aggregateFunction = $("select", listitem).val();
      agglst.append(listitem);
    });
  function finishAggregationForm() {
    $("li", agglst).each(function() {
        this.attributeNode.aggregateFunction = $("select", this).val();
      });
  }
  smallgraphsShowDialog("#aggregation-dialog", {
      title: "Choose How to Aggregate Attributes",
      width: document.body.offsetWidth * .618,
      buttons: [ { text: "Save", click: function() {
            finishAggregationForm();
            $(this).dialog("close");
            aggregationSetupInProgress = false;
          }} ],
      close: function() {
            aggregationSetupInProgress = false;
          },
    });
}
function sketchpadSetupAggregationForSelection() {
  var aggAttrNodes = [];
  sketchpadCurrentSelection.forEach(function(n) {
      if ($(n).hasClass("aggregate") && $(n).hasClass("node")) {
        if ($(n).hasClass("attribute"))
          aggAttrNodes.push(n);
        else
          aggAttrNodes = aggAttrNodes.concat(attributeNodesOf(n).toArray());
      }
    });
  sketchpadSetupAggregation(aggAttrNodes);
}

var aggregationSetupInProgress = false;
function sketchpadToggleAggregation() {
  if (aggregationSetupInProgress)
    return;
  // toggle aggregation
  sketchpadCurrentSelection.forEach(function(n) {
      if ($(n).hasClass("node") && !$(n).hasClass("attribute")) {
        $(n).toggleClass("aggregate");
        attributeNodesOf(n).toggleClass("aggregate");
      }
    });
  // choose how attributes are being aggregated
  sketchpadSetupAggregationForSelection();
}

$("#query-aggregate")
  .button()
  .click(sketchpadToggleAggregation)
  ;
var sketchpadAction_ToggleAggregation = {
  name: "toggle aggregation",
  keypress: sketchpadToggleAggregation,
};
var sketchpadAction_SetupAggregation = {
  name: "setup aggregation",
  dblclick: function() {
    var node = getNode(event.target);
    if (node) {
      if ($(node).hasClass("aggregate")) {
        if ($(node).hasClass("attribute"))
          sketchpadSetupAggregation([node]);
        else
          sketchpadSetupAggregation(attributeNodesOf(node).toArray());
      }
    }
  }
};



var sketchpadCurrentOrdering = [];
var orderingSelectionPrototype;
orderingSelectionPrototype = $("#ordering-list li")[0];
$("#ordering-list li").remove();
function sketchpadSetupOrdering(orderbyNodes) {
  if (orderbyNodes.length == 0)
    orderbyNodes = $(".orderby-desc.node, .orderby-asc.node", sketch).toArray();
  if (orderbyNodes.length == 0)
    return;
  var orderlst = $("#ordering-list");
  // prepare the form
  $("li", orderlst).remove();
  var idx = 0;
  orderbyNodes.forEach(function(node) {
      var listitem = $(orderingSelectionPrototype).clone();
      $("a", listitem)
        .click(function() { listitem.remove(); })
        ;
      listitem[0].node = node;
      var newId = $("label", listitem).attr("for").replace(/\d+$/, idx++);
      $("label", listitem)
        .attr({
            for: newId,
          })
        .text(
          $(node).hasClass("attribute") ?
            $("#"+node.subjectId +" text", sketch).text() +" "+
            prefixAttributeMark(node.attributeName)
          :
            $("text", node).text()
          )
        ;
      $("select", listitem)
        .attr("id", newId)
        .val(node.ordering)
        ;
      node.ordering = $("select", listitem).val();
      orderlst.append(listitem);
    });
  // make it reorderable
  orderlst.sortable();
  orderlst.disableSelection();
  function clearOrdering() {
    $(".orderby-desc.node, .orderby-asc.node", sketch)
      .removeClass("orderby-desc")
      .removeClass("orderby-asc")
      ;
    sketchpadCurrentOrdering = [];
  }
  function finishOrderingForm() {
    clearOrdering();
    $("li", orderlst).each(function() {
        this.node.ordering = $("select", this).val();
        $(this.node).addClass("orderby-"+this.node.ordering);
        sketchpadCurrentOrdering.push(this.node);
      });
  }
  smallgraphsShowDialog("#ordering-dialog", {
      title: "Choose How to Order the Results",
      width: document.body.offsetWidth * .618,
      buttons: [ { text: "Reset", click: function() {
              clearOrdering();
              $(this).dialog("close");
            }},
            { text: "Save", click: function() {
              finishOrderingForm();
              $(this).dialog("close");
            }},
          ],
    });
}
function sketchpadSetupOrderingForSelection() {
  var orderbyNodes = sketchpadCurrentOrdering.concat(
        removeAll(sketchpadCurrentSelection.filter(
            function(n) { return $(n).hasClass("node"); }),
          sketchpadCurrentOrdering)
      );
  sketchpadSetupOrdering(orderbyNodes);
}


$("#query-order")
  .button()
  .click(sketchpadSetupOrderingForSelection)
  ;


var sketchpadAction_SwitchMode = {
  name: "cycle mode",
  keypress: function() {
    var currentMode = $("#query-mode :checked")[0];
    var modes = $("#query-mode input");
    modes.each(function(i,b){
        if (b == currentMode)
          $(modes[(i+1) % modes.length]).click();
      });
  }
}


////////////////////////////////////////////////////////////////////////////////
// sketchpad modes of mapping actions
var sketchpadMode = {};
var sketchpadModeButton = $("#query-mode")
  .buttonset()
  ;

var sketchpadMouseActions = [];
var sketchpadKeyActions = [];
function SketchpadActionHandler(handlerPrototype) {
  // FIXME there must be a better way than copying contents of handler
  for (var i in handlerPrototype)
    this[i] = handlerPrototype[i];
}

var sketchpadPervasiveMode = [
    { handler: sketchpadAction_SelectNodeOrEdge },
    { handler: sketchpadAction_SelectNodeOrEdge , modifierKeys: ["meta"] },
    { handler: sketchpadAction_SelectNodeOrEdge , modifierKeys: ["ctrl"] },
    { handler: sketchpadAction_SelectArea       },
    { handler: sketchpadAction_RemoveSelection  , forKeys: [ /*DOM_VK_BACK_SPACE*/8, /*DOM_VK_DELETE*/46, ] },
    { handler: sketchpadAction_SwitchMode       , forKeys: [ /*DOM_VK_ALT18,*/ /*DOM_VK_M*/77, ] },
    { handler: sketchpadAction_ToggleAggregation, forKeys: [ /*DOM_VK_A*/65, ] },
    { handler: sketchpadAction_SetupAggregation },
    { handler: sketchpadAction_AddConstraint    },
  ];

// TODO distinguish actions into two groups:
//  1. single body actions (click,dblclick,keypress) vs.
//  2. stateful ones (mousedown->move->up, keydown->up)
// TODO make it easier to map single actions to click or dblclick from here
sketchpadMode.sketch = sketchpadPervasiveMode.concat([
    { handler: sketchpadAction_AddNode          ,                       },
    { handler: sketchpadAction_DrawEdgeFromANode,                       },
    { handler: sketchpadAction_MoveNode         , modifierKeys: ["alt"] },
  ]);

sketchpadMode.layout = sketchpadPervasiveMode.concat([
    { handler: sketchpadAction_AddNode          , modifierKeys: ["alt"] },
    { handler: sketchpadAction_DrawEdgeFromANode, modifierKeys: ["alt"] },
    { handler: sketchpadAction_MoveNode         ,                       },
  ]);

var sketchpadCurrentMode;
function sketchpadSwitchToMode(modeName) {
  console.log("switching mode to", modeName);
  var mode = sketchpadMode[modeName];
  var mouseActionHandlers = [];
  var keyActionHandlers = [];
  mode.forEach(function(mapping){
      var h = new SketchpadActionHandler(mapping.handler);
      h.modifierKeys = mapping.modifierKeys;
      if (h.mousedown || h.click || h.dblclick) {
        mouseActionHandlers.push(h);
      } else if (h.keydown || h.keypress) {
        h.forKeys = mapping.forKeys;
        keyActionHandlers.push(h);
      }
    });
  sketchpadCurrentMode = mode;
  sketchpadMouseActions = mouseActionHandlers;
  sketchpadKeyActions = keyActionHandlers;
}
sketchpadSwitchToMode($("#query-mode input[checked]").val());
sketchpadModeButton
  .change(function() { sketchpadSwitchToMode(event.target.value); })
  ;


////////////////////////////////////////////////////////////////////////////////
// sketchpad action dispatcher
////////////////////////////////////////////////////////////////////////////////
// See for keycodes: https://developer.mozilla.org/en/DOM/KeyboardEvent#Virtual_key_codes
var sketchpadCurrentMouseActions = [];
var sketchpadFirstMouseEvent = null;
function SketchpadAction(handler) {
  // FIXME there must be a better way than copying contents of handler
  for (var i in handler)
    this[i] = handler[i];
}
var ModifierKeys = ["shift", "alt", "ctrl", "meta"];
function sketchpadActionDefSatisfyModifierKey(handler) {
  if (handler.modifierKeys) {
    var keyIsOn = function(modifier){ return event[modifier+"Key"]; }
    if (!(handler.modifierKeys.every(keyIsOn) &&
          !removeAll(ModifierKeys, handler.modifierKeys).some(keyIsOn)))
      return false;
  } else {
    if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey)
      return false;
  }
  return true;
}
function sketchpadMouseDown() {
  sketchpadFirstMouseEvent = event;
  sketchpadMouseActions.forEach(function(handler) {
      if (handler.mousedown) {
        if (!sketchpadActionDefSatisfyModifierKey(handler)) return;
        try {
          var a = new SketchpadAction(handler);
          var r = a.mousedown();
          if (r != null) {
            console.debug(event.type, event, a, a.name);
            if (r) sketchpadCurrentMouseActions.push(a);
          }
        } catch (err) {
          console.error(err, err+"");
        }
      }
  });
}
function sketchpadMouseMove() {
  sketchpadCurrentMouseActions.forEach(function(a) {
    try {
      if (a.mousemove) {
        console.debug(event.type, event, a, a.name);
        a.mousemove();
      }
    } catch (err) {
      console.error(err, err+"");
    }
  });
}
function sketchpadMouseUp() {
  if (sketchpadFirstMouseEvent == null)
    return;
  sketchpadCurrentMouseActions.forEach(function(a) {
    try {
      if (a.mouseup) {
        console.debug(event.type, event, a, a.name);
        a.mouseup();
      }
    } catch (err) {
      console.error(err, err+"");
    }
  });
  sketchpadCurrentMouseActions = [];
  // process clicks if were not dragging
  if (Math.abs(event.pageX-sketchpadFirstMouseEvent.pageX) < MouseMoveThreshold &&
      Math.abs(event.pageY-sketchpadFirstMouseEvent.pageY) < MouseMoveThreshold) {
    sketchpadMouseActions.forEach(function(handler) {
      if (handler.click) {
        if (!sketchpadActionDefSatisfyModifierKey(handler)) return;
        try {
          var a = new SketchpadAction(handler);
          console.debug("click", event, a, a.name);
          a.click();
        } catch (err) {
          console.error(err, err+"");
        }
      }
    });
  }
  sketchpadFirstMouseEvent = null;
}

function sketchpadDblClick() {
  sketchpadMouseActions.forEach(function(handler) {
      if (handler.dblclick) {
      if (!sketchpadActionDefSatisfyModifierKey(handler)) return;
        try {
          var a = new SketchpadAction(handler);
          console.debug(event.type, event, a, a.name);
          a.dblclick();
        } catch (err) {
          console.error(err, err+"");
        }
      }
    });
}

var sketchpadCurrentKeyActions = [];
function sketchpadKeyDown() {
  // skip events occurred on input elements
  if (event.target.tagName.match(/input/i))
    return;
  sketchpadKeyActions.forEach(function(handler) {
    if (handler.forKeys && handler.forKeys.indexOf(event.keyCode) != -1) {
      if (handler.keydown) {
        try {
          var a = new SketchpadAction(handler);
          var r = a.keydown();
          if (r != null) {
            console.debug(event.type, event, a, a.name);
            if (r) sketchpadCurrentKeyActions.push(a);
          }
        } catch (err) {
          console.error(err, err+"");
        }
      }
    }
  });
  // don't let the browser behave strangely by preventing the default
  // except Command-key/Windows-key related key combinations
  if (!event.metaKey)
    event.preventDefault();
}
function sketchpadKeyUp() {
  sketchpadCurrentKeyActions.forEach(function(a) {
    try {
      if (a.keyup) {
        console.debug(event.type, event, a, a.name);
        a.keyup();
      }
    } catch (err) {
      console.error(err, err+"");
    }
  });
  sketchpadCurrentKeyActions = [];
  // skip events occurred on input elements
  if (event.target.tagName.match(/input/i))
    return;
  // process keypresses TODO if were not repeating?
  // if (true) {
    sketchpadKeyActions.forEach(function(handler) {
      if (handler.keypress && handler.forKeys && handler.forKeys.indexOf(event.keyCode) != -1) {
        try {
          var a = new SketchpadAction(handler);
          console.debug("keypress", event, a, a.name);
          a.keypress();
        } catch (err) {
          console.error(err, err+"");
        }
      }
    });
  // }
  // TODO longkeypress?
}
$(sketchpad)
  .bind("mousedown", sketchpadMouseDown)
  .bind("dblclick",  sketchpadDblClick)
  ;
$(window)
  .bind("mousemove", sketchpadMouseMove)
  .bind("mouseup",   sketchpadMouseUp)
  .bind("keydown",   sketchpadKeyDown)
  .bind("keyup",     sketchpadKeyUp)
  ;


////////////////////////////////////////////////////////////////////////////////
// query execution & result presentation
////////////////////////////////////////////////////////////////////////////////
var smallgraphsCurrentOffset;
var smallgraphsCurrentQuery;
var smallgraphsCurrentResultMapping;

function smallgraphsRunQuery() {
  // XXX I know this is ugly, but it's required to prevent sketching elements from coming in
  if (queryTypeEntryHandler) {
    queryTypeEntryHandler();
    queryTypeEntryHandler = null;
  }

  // derive SmallGraph query from the sketch
  var derived = smallgraphsCompileSketchToQuery();
  var query = smallgraphsCurrentQuery = derived[0];
  smallgraphsCurrentResultMapping = derived[1];

  // check if we can really run this query
  if (query.length == 0) {
    smallgraphsShowError("Empty query: Please sketch something to begin your search.");
    return;
  }

  smallgraphsSendQuery(query, 0);
}

function smallgraphsSendQuery(query, offset, msg) {
  var queryURL = smallgraphsGraphURL + "/query";

  var sgq = "<pre>"+ smallgraph.serialize(query) +"</pre>";
  if (msg == null) {
    if (offset == 0)
      msg = "Running at "+ queryURL +":<br>" + sgq;
    else
      msg = "Getting "+ ResultPageSize +" more results from "+ queryURL +":<br>" + sgq;
  }

  // indicate we're in progress
  var ajaxHandle;
  var progress = smallgraphsShowDialog("#progress-dialog", {
        title: "Running Query",
        buttons: [ { text: "Cancel", click: function() {
              if (ajaxHandle)
                ajaxHandle.abort();
              else
                $(this).dialog("close");
            }} ],
      },
      msg
    );

  if (offset == null)
    offset = 0;

  if (typeof debugResultURL == "string")
    queryURL = debugResultURL;

  // send it to server and get response
  console.debug("sending query to "+ queryURL, "limiting range to "+ offset +"-"+ (offset+ResultPageSize), "\n"+ smallgraph.serialize(query), query, "\n"+ JSON.stringify(query));
  ajaxHandle = $.ajax({
        type: 'POST',
        url: queryURL,
        contentType: "application/json",
        headers: {
            "SmallGraphs-Result-Limit": ResultPageSize,
            "SmallGraphs-Result-Offset": offset,
          },
        data: JSON.stringify(query),
        processData: false,
        dataType: "json",
        timeout: 3600000,//ms
        success: function(result) {
            ajaxHandle = null;
            console.debug("got result", "\n"+ JSON.stringify(result) +"\n", result);
            // to show each subgraph instance as small multiples
            try {
              smallgraphsShowResults(result, offset);
            } catch (err) {
              console.error(err);
              smallgraphsShowError(
                  "Error occurred while running query at '"+ queryURL +"':<br>" +
                  "<pre>"+ err +"</pre>"
                );
            }
            // remove progress indicator
            progress.dialog("close");
          },
        error: function(jqXHR, textStatus, err) {
            ajaxHandle = null;
            console.error(textStatus, err);
            // remove progress indicator
            progress.dialog("close");
            if (textStatus == "abort")
              return;
            // show error in a dialog
            smallgraphsShowError(
                    "Error occurred while running query at '"+ queryURL +"':<br>" +
                    "<pre>"+ textStatus + "\t" + err +"</pre>" +
                    "Your query was:" + sgq
                );
          },
      });
}

function smallgraphsCompileSketchToQuery() {
  function outAttributeRelated() {
    return !$(this).hasClass("attribute");
  }
  var edges = $(".edge", sketch).filter(outAttributeRelated).toArray();
  //// try to use all edges for stretching walks on both ends
  var ws = [];
  var w = edges.splice(0,1);
  while (edges.length > 0) {
    var first = w[0];
    var last = w[w.length-1];
    var edgesUsed = [];
    for (var i in edges) {
      var e = edges[i];
      if (e.target == first.source) {
        // extend left-end
        w.unshift(e);
        first = e;
        edgesUsed.push(e);
      } else if (last.target == e.source) {
        // extend right-end
        w.push(e);
        last = e;
        edgesUsed.push(e);
      }
    }
    edges = removeAll(edges, edgesUsed);
    if (edgesUsed.length == 0) {
      // this walk is complete, no more edges can extend it
      // save it and let's start a new walk
      ws.push(w);
      if (edges.length > 0)
        w = edges.splice(0,1);
      else
        w = null;
    }
  }
  if (w && w.length > 0)
    ws.push(w);
  // count occurences of objects to use references or not
  var nodeOccurs = {};
  function seenNode(n) { if (nodeOccurs[n]) nodeOccurs[n]++; else nodeOccurs[n] = 1; }
  ws.forEach(function(w){
      seenNode(w[0].source.id);
      w.forEach(function(e){
          seenNode(e.target.id);
        });
    });
  // handle unconnected islands
  $(".node", sketch)
    .filter(outAttributeRelated)
    .filter(function(){
        return ! nodeOccurs[this.id];
      })
    .each(function(){
        // insert fake/partial edges to create single step walks
        ws.push([{source:this}]);
        nodeOccurs[this.id] = 1;
      })
    ;
  //// build a mapping from result data back to a diagram
  var resultMappings = [];
  function addResultMapping(i, j, obj) {
    var schema;
    if (obj.objectType != null && smallgraphsGraphSchema.Objects != null)
      schema = smallgraphsGraphSchema.Objects[obj.objectType];
    else if (obj.linkType != null && smallgraphsGraphSchema.Links != null)
      schema = smallgraphsGraphSchema.Links[obj.linkType];
    var getLabel;
    if (schema != null && schema.Label != null)
      getLabel = function(schema) {
        return function(step) { return (step.attrs != null ? step.attrs[schema.Label] : step.id) || step.id; };
      }(schema);
    else
      getLabel = function(step) { return step.label || step.id; };
    resultMappings.push(function(data, resultSVG) {
        var step = data.walks[i][j];
        if (step == null)
          return;
        if (typeof step == "string")
          step = data.names[step];
        var resultObj = $("#"+obj.id, resultSVG)[0];
        $("text", resultObj).text(getLabel(step));
        // bind data to the DOM for later use
        // TODO use dataset API http://www.w3.org/TR/html5/elements.html#custom-data-attribute
        resultObj.data = step;
        resultObj.value = step.label;
      });
  }
  var i = 0;
  ws.forEach(function(w){
      var j = 0;
      addResultMapping(i, j++, w[0].source);
      if (w[0].target)
        w.forEach(function(e){
            addResultMapping(i, j++, e);
            addResultMapping(i, j++, e.target);
          });
      i++;
    });
  //// build a SmallGraph query from it
  function stepObject(o, noref) {
    if (!noref && nodeOccurs[o.id] > 1)
      return { objectRef: o.id };
    else
      return { objectType: o.objectType };
    // TODO constraints
  }
  function stepLink(e) {
    return { linkType: e.linkType };
    // TODO constraints
  }
  // scan nodes being aggregated
  var aggregationMap = {};
  $(".aggregate.node", sketch).each(function(i,n) {
      if ($(n).hasClass("attribute")) return;
      aggregationMap[n.id] = [];
      nodeOccurs[n.id]++;
    });
  // scan nodes for ordering
  sketchpadCurrentOrdering.forEach(function(n) {
      if (! $(n).hasClass("attribute"))
        nodeOccurs[n.id]++;
    });
  // enumerate attributes we're interested in
  var attributes = [];
  $(".attribute.edge", sketch).each(function(i,e){
        if (aggregationMap[e.source.id]) // either aggregated
          aggregationMap[e.source.id].push([e.linkType, (e.target.aggregateFunction || "count").toLowerCase()]); // FIXME: assign aggregateFunction when adding attributes to aggregated nodes
        else // or individual value
          attributes.push({look:[e.source.id, [e.linkType]]});
          // TODO attributes.push({look:[e.source.id, [{name:e.linkType, constraint:[/*constraints CNF*/]}]]});
        resultMappings.push(function(data, resultSVG) {
            var attr = data.names[e.source.id].attrs;
            if (attr) {
              var v = attr[e.linkType];
              var resultObj = $("#"+e.target.id, resultSVG)[0];
              $("text", resultObj).text(v);
              // bind data to the DOM for later use
              // TODO use dataset API http://www.w3.org/TR/html5/elements.html#custom-data-attribute
              resultObj.data = v;
              resultObj.value = v;
            }
          });
        nodeOccurs[e.source.id]++;
      });
  // codegen aggregations
  var aggregations = [];
  for (var nId in aggregationMap) {
    var attrsToAggregate = aggregationMap[nId];
    aggregations.push({aggregate:[nId, attrsToAggregate]});
  }
  // codegen orderbys
  var orderings = [];
  sketchpadCurrentOrdering.forEach(function(n) {
      if ($(n).hasClass("attribute"))
        orderings.push([n.subjectId, n.attributeName, n.ordering]);
      else
        orderings.push([n.id, null, n.ordering]);
    });
  // declare objects we will later reference a few times
  var namedObjects = [];
  for (var id in nodeOccurs) {
    if (nodeOccurs[id] > 1)
      namedObjects.push({let:[id, stepObject($("#"+id)[0], true)]});
  }
  // codegen walks
  var walks = [];
  for (var i in ws) {
    var walk = [];
    walk.push(stepObject(ws[i][0].source));
    if (ws[i][0].target)
      for (var j in ws[i]) {
        var e = ws[i][j];
        walk.push(stepLink(e));
        walk.push(stepObject(e.target));
      }
    walks.push({walk:walk});
  }
  // complete codegen
  var query = namedObjects
    .concat(walks)
    .concat(attributes)
    .concat(aggregations)
    .concat({orderby:orderings})
    ;
  var resultMapping = function(data, resultSVG) {
    resultMappings.forEach(function(mapping) {
        mapping(data, resultSVG);
      });
  };
  return [query, resultMapping];
}

var results = $("#results");
$("#result-more")
  .text("Get "+ ResultPageSize +" more...")
  .button()
  .click(function() {
      smallgraphsSendQuery(
          smallgraphsCurrentQuery,
          smallgraphsCurrentOffset + ResultPageSize
        );
    })
  ;
var smallgraphsCurrentResultPrototype;
var smallgraphsCurrentResultOverview;
function smallgraphsShowResults(data, offset) {
  if (offset == 0) {
    // remove if we're starting fresh
    $(".result", results).remove();
    if (smallgraphsCurrentResultPrototype) {
      smallgraphsCurrentResultPrototype.remove();
      smallgraphsCurrentResultPrototype = null;
    }
    // dynamically determine the bounding box of sketch and use that as the size for each
    var sketchWidth  = sketchpad.offsetWidth;
    var sketchHeight = sketchpad.offsetHeight;
    var firstNode = $(".node", sketch)[0];
    var minX, maxX; minX = maxX = firstNode.x;
    var minY, maxY; minY = maxY = firstNode.y;
    $(".node", sketch).each(function(i,n){
        minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x);
        minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y);
      });
    sketchWidth  = maxX - minX + 2*NodeWidth ;
    sketchHeight = maxY - minY + 2*NodeHeight;
    var translateX = - minX + NodeWidth  + sketchWidth  * ResultPaddingH;
    var translateY = - minY + NodeHeight + sketchHeight * ResultPaddingV;
    var resultWidth  = ResultScale * sketchWidth  * (1+2*ResultPaddingH);
    var resultHeight = ResultScale * sketchHeight * (1+2*ResultPaddingV);
    // build a prototype for individual result
    var resultPrototype = $("<div>")
        .attr({
            class: "result",
          })
        .css({
            width : resultWidth +"px",
            height: resultHeight+"px",
          })
        .append(
            $(document.createElementNS(SVGNameSpace, "svg"))
              .append(
                  $(sketch).parent().find("defs").clone()
                )
              .append(
                  $(sketch).clone()
                    .removeAttr("id")
                    .attr({
                        transform: "scale("+ ResultScale +"), translate("+ translateX +","+ translateY +")",
                      })
                )
          )
        ;
    var marker = $("marker", resultPrototype);
    marker.attr({
        id: "result-arrowhead",
        markerWidth:  marker.attr("markerWidth" )/ResultScale,
        markerHeight: marker.attr("markerHeight")/ResultScale,
      })
      ;
    $(".node, .edge", resultPrototype)
      .removeClass("selected attribute invalid orderby-desc orderby-asc")
      ;
    $(".edge text", resultPrototype)
      .remove()
      ;
    // TODO adjust edge coords, or add an arrow-ending? updateEdgeCoordinates(e, x2, y2);
    smallgraphsCurrentResultPrototype = resultPrototype;
    // from the query, derive a function for summarizing data for visual encodings
    var dataOverview = {};
    var dataColorIndex = 0;
    function addDataOverviewFor(id, name, map) {
      dataOverview[id] = {
        id: id,
        attr: name,
        map: map,
        min: null,
        max: null,
        sum: null,
        count: 0,
        fillColor: ResultFillColors[dataColorIndex++],
      };
      dataColorIndex %= ResultFillColors.length;
    }
    smallgraphsCurrentQuery.forEach(function(decl) {
        if (decl.aggregate) {
          var agg = decl.aggregate;
          var id = agg[0];
          addDataOverviewFor(id, "label",
            function(d) { return d.names[id].label; });
          agg[1].forEach(function(attrAgg) {
              var attrName = attrAgg[0];
              var aggfn = attrAgg[1];
              $(".attribute.node", sketch)
                .filter(function() { return this.subjectId == id && this.attributeName == attrName; })
                .toArray().forEach(function(attrNode) {
                    addDataOverviewFor(attrNode.id, attrName,
                      function(d) { return d.names[id].attrs[attrName]; });
                  })
                ;
            });
        } else if (decl.look) {
          var look = decl.look;
          var id = look[0];
          look[1].forEach(function(attrName) {
              $(".attribute.node", sketch)
                .filter(function() { return this.subjectId == id && this.attributeName == attrName; })
                .toArray().forEach(function(attrNode) {
                    if (QuantitativeTypes[attrNode.attributeType] != null)
                      addDataOverviewFor(attrNode.id, attrName,
                        function(d) { return (d.names[id].attrs[attrName]); });
                  })
                ;
            });
        }
      });
    smallgraphsCurrentResultOverview = dataOverview;
  }
  // analyze new data for finding data range for visual encodings
  for (var id in smallgraphsCurrentResultOverview) {
    var overview = smallgraphsCurrentResultOverview[id];
    data.forEach(function(d) {
        var v = overview.map(d);
        if (overview.count == 0) {
          overview.sum = v;
          overview.min = v;
          overview.max = v;
        } else {
          overview.sum += v;
          if (v < overview.min) overview.min = v;
          if (v > overview.max) overview.max = v;
        }
        overview.count++;
      });
  }
  // now, show each of them with the resultPrototype
  for (var i in data) {
    var aResult = smallgraphsCurrentResultPrototype.clone();
    smallgraphsCurrentResultMapping(data[i], aResult);
    aResult.appendTo(results);
  }
  smallgraphsCurrentOffset = offset;
  // do more visual encoding
  for (var id in smallgraphsCurrentResultOverview) {
    var overview = smallgraphsCurrentResultOverview[id];
    var fillColor = overview.fillColor;
    var elements = $("#"+id, results);
    if (elements.hasClass("node")) {
      var rect = $("rect", elements);
      var x = rect.attr("x");
      var y = rect.attr("y");
      var h = rect.attr("height");
      var w = rect.attr("width");
      // FIXME sometimes w is strangely big
      var wScale = d3.scale.linear()
        .domain([overview.min, overview.max])
        .range([0, w])
        ;
      // XXX D3, as of 2.7.0, has a problem setting parentNode to div.result
      // so I had to use multiple group selection, which will have a little overhead :(
      function getValue(n) { return [n.value]; };
      var column = elements.toArray().map(getValue);
      var d3sel = d3.select(results[0])
        .selectAll("#"+id).data(column)
        .selectAll(".overlay").data(Identity);
      d3sel
        .enter()
          .append("svg:rect")
          .attr("class", "overlay")
          .style("fill", fillColor)
          .attr("x", x)
          .attr("y", y)
          .attr("rx", NodeRounding)
          .attr("ry", NodeRounding)
          .attr("height", h)
          .attr("width", 0)
        .transition().duration(ResultUpdateTransitionDuration)
          .attr("width", wScale)
          ;
      d3sel
        .transition().duration(ResultUpdateTransitionDuration)
          .attr("width", wScale)
          ;
    } // TODO also do edges
  }
  // if data was full page, then add a button for fetching more
  if (data.length == ResultPageSize) {
    $("#result-stats").text("Showing first "+ (offset+data.length) +" results");
    $("#result-more").addClass("active");
  } else {
    $("#result-stats").text("Showing all "+ (offset+data.length) +" results");
    $("#result-more").removeClass("active");
  }
  // click to open the result accordion only when starting fresh
  if (offset == 0)
    $("#result-header").click();
}

$("#query-run")
  .button()
  .click(smallgraphsRunQuery)
  ;
$("#result-refine")
  .button()
  .click(function(){ $("#query-header").click(); })
  ;


$("#result-reorder")
  .button()
  .click(function() {
      // FIXME reorder results from here
      $("#result-refine").click();
      setTimeout(function() {
        $("#query-order").click();
      }, 500);
    })
  ;


////////////////////////////////////////////////////////////////////////////////
// overall UI layout
$(sketchpad)
  .css({
      width : window.innerWidth  - 40 + "px",
      height: window.innerHeight - 140 + "px",
    })
  ;
$("#frame").accordion({
      animated: true,
      //fillSpace: true,
      event: "click",
      changestart: function(event, ui) {
          $("#"+ ui.oldContent.attr("id") +"-tools").removeClass("active");
          $("#"+ ui.newContent.attr("id") +"-tools").   addClass("active");
        },
    });
$("#query-tools").addClass("active");
sketchpadPageLeft = sketchpad.offsetLeft + sketchpad.offsetParent.offsetLeft;
sketchpadPageTop  = sketchpad.offsetTop  + sketchpad.offsetParent.offsetTop;


$("#loading-screen").remove();

});