(function (root, factory) {
    // Support CommonJS
    if (typeof exports === 'object') {
        var plugin = factory();

        // Support NodeJS & Component, which allow module.exports to be a function
        if (typeof module === 'object' && module && module.exports) {
            exports = module.exports = plugin;
        }

        // Support CommonJS 1.1.1 spec
        exports.syncmeta = plugin;

        // Support AMD
    } else if (typeof define === 'function' && define.amd) {
        define([], factory);

        // Support vanilla script loading
    } else {
        root.syncmeta = factory();
    }
}(this, function () {
    'use strict';
    var generateRandomId = function (length) {
        var chars = "1234567890abcdef";
        var numOfChars = chars.length;
        var i, rand;
        var res = "";

        if (typeof length === 'undefined') length = 24;

        for (i = 0; i < length; i++) {
            rand = Math.floor(Math.random() * numOfChars);
            res += chars[rand];
        }
        return res;
    };

    function httpGetAsync(theUrl, callback) {
        var xmlHttp = new XMLHttpRequest();
        xmlHttp.onreadystatechange = function () {
            if (xmlHttp.readyState == 4 && xmlHttp.status == 200)
                callback(xmlHttp.responseText);
        }
        xmlHttp.open("GET", theUrl, true); // true for asynchronous 
        xmlHttp.send(null);
    }
    /**
     * Listen to node manipulations. Private helper function
     * @private
     * @param {array} keys - the operations to listen to. All possible options are  ['NodeMoveOperation', 'NodeResizeOperation', 'NodeMoveZOperation']
     * @param {function} callback - the callback if one of the operations defined in keys were issued
     */
    var onNode = function (key, callback) {
        var newObersever = function (event) {
            if (key.indexOf(event.name) != -1) {
                callback(event.value);
            }
        };

        var nodeIds = ySyncMetaInstance.share.nodes.keys();
        for (var i = 0; i < nodeIds.length; i++) {
            var ymap = ySyncMetaInstance.share.nodes.get(nodeIds[i]);
            ymap.observe(newObersever);
        }
        nodeObservers[key].push(newObersever);
    };
    var nodeObservers = {
        NodeMoveOperation: [],
        NodeResizeOperation: [],
        NodeMoveZOperation: []
    };
    var attrObservers = {
        nodes: {
            attributeYTextObserver: undefined,
            attributePrimitiveObserver: undefined
        },
        edges: {
            attributeYTextObserver: undefined,
            attributePrimitiveObserver: undefined
        }
    }
    var ySyncMetaInstance = null;

    var jabberId = null;

    /**
     * Listen to changes on Attributes on nodes or edges
     * @param {string} type - 'nodes' or 'edges'
     * @param {onAttributeChangeCallback} callback - calls back if a attribute is changed
     * @param {string} entityId - id of the node to listen to. If null we listen to all of the specified type
     * @private
     */
    var onAttributeChange = function (type, callback) {
        if (!ySyncMetaInstance)
            return new Error('No Connection to Yjs space');


        attrObservers[type].attributePrimitiveObserver = function (entityId) {
            return function (event) {
                if (event.name.search(/\w*\[(\w|\s)*\]/g) != -1) {
                    callback(event.value.value, entityId, event.value.entityId, event.value.userId);
                }
            }
        }
        attrObservers[type].attributeYTextObserver = function (entityId, attrId) {
            return function (event) {
                callback(event.object.toString(), entityId, attrId);
            }
        };

        var listenToAttributes = function (ymap, entityId) {
            var listentoAttributesHelper = function (attrId, ytext, entityId) {
                var newObserver = attrObservers[type].attributeYTextObserver(entityId, attrId);
                ytext.observe(newObserver);
            };

            var newObserver = attrObservers[type].attributePrimitiveObserver(entityId);
            ymap.observe(newObserver);

            var keys = ymap.keys();
            for (var i = 0; i < keys.length; i++) {
                if (keys[i].search(/\w*\[(\w|\s)*\]/g) != -1) {
                    var ytext = ymap.get(keys[i]);
                    //is it relly a y-text object?
                    if (ytext instanceof Y.Text.typeDefinition.class)
                        listentoAttributesHelper(keys[i], ytext, entityId);
                }
            }
        };

        //listen to everything OR return
        var nodeIds = ySyncMetaInstance.share[type].keys();
        for (var i = 0; i < nodeIds.length; i++) {
            var p = ySyncMetaInstance.share[type].get(nodeIds[i]);
            if (p) {
                listenToAttributes(p, nodeIds[i]);
            }
        }
    };

    /**
     * creates all ytexts for a node/edge created via the API
     * @param {object} metamodel the vls
     * @param {string} entityId the id of the node/edge
     * @param {string} entityType where is the concrete type to find which u want to create in nodes or edges
     * @param {string} type the concrete node/edge type to create
     * @param {Y.Map} ymap the ymap of the node/edge
     */
    var createYTextsForEntityType = function (metamodel, entityId, entityType, type, ymap) {
        var types = metamodel[entityType];
        for (var key in types) {
            if (types.hasOwnProperty(key) && types[key].label === type) {
                var attrs = types[key].attributes;
                for (var attrKey in attrs) {
                    if (attrs.hasOwnProperty(attrKey) && attrs[attrKey].value === 'string') {
                        ymap.set(entityId + '[' + attrs[attrKey].key + ']', Y.Text);
                    }
                }
            }
        }
    }


    return {
        /**
         * If are already connected to a syncmeta yjs space then use this funnction to init the plugin
         * Otherwise connect to yjs with the connect function
         * @param {object} yInstance - the y instance 
         * @param {String} [userId] the id of the user. Otherwise a HTTP GET-request will be issued to get the data
         * @param {Function} [callback]
         * @return {undefined}
         */
        init: function (yInstance, userId, callback) {
            ySyncMetaInstance = yInstance;

            var attrObserverInit = function (type, ymap, id) {
                if (attrObservers[type].attributePrimitiveObserver && attrObservers[type].attributeYTextObserver) {
                    ymap.observe(function (e) {
                        if (e.type === 'add' && e.name.search(/\w*\[(\w|\s)*\]/g) != -1) {
                            var attrId = e.name;
                            if (e.value instanceof Y.Text.typeDefinition.class) {
                                var ytext = e.value;
                                var newObserver = attrObservers[type].attributeYTextObserver(id, attrId);
                                ytext.observe(newObserver);
                            } else {
                                var newObersever = attrObservers[type].attributePrimitiveObserver(id);
                                e.object.observe(newObersever);
                            }
                        }
                    });
                }
            }

            ySyncMetaInstance.share.nodes.observe(function (event) {
                var nodeId = event.name;
                if (event.type === 'add') {
                    var ymap = event.value;
                    for (var key in nodeObservers) {
                        if (nodeObservers.hasOwnProperty(key)) {
                            for (var i = 0; i < nodeObservers[key].length; i++) {
                                ymap.observe(nodeObservers[key][i]);
                            }
                        }
                    }
                    attrObserverInit('nodes', ymap, nodeId);
                }
            });

            ySyncMetaInstance.share.edges.observe(function (event) {
                var edgeId = event.name;
                if (event.type === 'add') {
                    var ymap = event.value;
                    attrObserverInit('edges', ymap, edgeId);
                }
            });
            if (userId)
                jabberId = userId;
            else {
                var url = localStorage.userinfo_endpoint + '?access_token=' + localStorage.access_token;
                httpGetAsync(url, function (data) {
                    var user = JSON.parse(data);
                    jabberId = JSON.parse(data).sub;
                    if (callback) callback(user);
                });
            }

        },
        /**
         * Listen to NodeAddOperations on the SyncMeta canvas widget
         * @param {onNodeAddCallback} callback - the callback if a node was created on syncmeta canvas widget
         */
        onNodeAdd: function (callback) {
            if (!ySyncMetaInstance)
                return new Error('No Connection to Yjs space');

            ySyncMetaInstance.share.canvas.observe(function (event) {
                if (event.name == 'NodeAddOperation')
                    callback(event.value);
            });
        },
        /**
         * @param{function} callback - callback if a users joins the space
         */
        onUserJoin: function (callback) {
            if (!ySyncMetaInstance)
                return new Error('No Connection to Yjs space');
            ySyncMetaInstance.share.userList.observe(function (event) {
                callback(event.value);
            })
        },
        /**
         * Listen to EdgeAddOperation on the SyncMeta canvas widget
         * @param {onEdgeAddCallback} callback - the callback if a edge was created on syncmeta canvas widget
         */
        onEdgeAdd: function (callback) {
            if (!ySyncMetaInstance)
                return new Error('No Connection to Yjs space');

            ySyncMetaInstance.share.canvas.observe(function (event) {
                if (event.name == 'EdgeAddOperation')
                    callback(event.value);
            });
        },
        /**
         * Listen to both EdgeAddOperation and NodeAddOperation
         * @param callback - the callback if edge or node was created on syncmeta canvas widget
         * @see onNodeAdd
         * @see onEdgeAdd
         */
        onEntityAdd: function (callback) {
            if (!ySyncMetaInstance)
                return new Error('No Connection to Yjs space');

            ySyncMetaInstance.share.canvas.observe(function (event) {
                if (event.name == 'NodeAddOperation')
                    callback(event.value);
                else if (event.name == 'EdgeAddOperation')
                    callback(event.value, event.name);
            });

        },
        /**
         * Listen to selections of entities on the Syncmeta canvas widget
         * @param {onEntitySelectCallback} callback - the callback if a entity was selected
         */
        onEntitySelect: function (callback) {
            if (!ySyncMetaInstance)
                return new Error('No Connection to Yjs space');

            ySyncMetaInstance.share.select.observe(function (event) {
                if (event.value)
                    callback(event.value);
            });
        },
        /**
         * Listen to selections of nodes on the Syncmeta canvas widget
         * @param {onEntitySelectCallback} callback - the callback if a node was selected
         */
        onNodeSelect: function (callback) {

            if (!ySyncMetaInstance)
                return new Error('No Connection to Yjs space');
            ySyncMetaInstance.share.select.observe(function (event) {
                if (event.value && ySyncMetaInstance.share.nodes.keys().indexOf(event.value) != -1)
                    callback(event.value);
            });
        },
        /**
         * Listen to selections of edges on the Syncmeta canvas widget
         * @param {onEntitySelectCallback} callback - the callback if a edge was selected
         */
        onEdgeSelect: function (callback) {
            if (!ySyncMetaInstance)
                return new Error('No Connection to Yjs space');
            ySyncMetaInstance.share.select.observe(function (event) {
                if (event.value && ySyncMetaInstance.share.edges.keys().indexOf(event.value) != -1)
                    callback(event.value);
            });
        },
        /**
         * Listen to NodeDeleteOperation
         * @param {onEntityDeleteCallback} callback - the callback if a node was deleted
         */
        onNodeDelete: function (callback) {
            if (!ySyncMetaInstance)
                return new Error('No Connection to Yjs space');
            ySyncMetaInstance.share.nodes.observe(function (event) {
                if (event.type === 'delete')
                    callback(event.name);
            });

        },
        /**
         * Listen to EdgeDeleteOperations
         * @param {onEntityDeleteCallback} callback - the callback if a edge was deleted
         */
        onEdgeDelete: function (callback) {
            if (!ySyncMetaInstance)
                return new Error('No Connection to Yjs space');
            ySyncMetaInstance.share.edges.observe(function (event) {
                if (event.type === 'delete')
                    callback({ id: event.name, source: event.oldValue.get('source'), target: event.oldValue.get('target'), type: event.oldValue.get('type') });
            });
        },
        /**
         * Listen to NodeMoveOperations
         * Equivalent to onNode(['NodeMoveOperation'], callback, id);
         * @param {onNodeMoveCallback} callback - the callback if a node is moved on the canvas
         * @param {string} id - id of the node to listen to. If null we listen to all
         * @see onNode
         */
        onNodeMove: function (callback) {
            if (!ySyncMetaInstance)
                return new Error('No Connection to Yjs space');
            onNode('NodeMoveOperation', callback);
        },
        /**
         * Listen to NodeResizeOperations
         * Equivalent to onNode(['NodeResizeOperation'], callback, id);
         * @param {onNodeResizeCallback} callback - the callback if a node is resized on the canvas
         * @param {string} id - id of the node to listen to. If null we listen to all
         * @see OnNode
         */
        onNodeResize: function (callback) {
            if (!ySyncMetaInstance)
                return new Error('No Connection to Yjs space');
            onNode('NodeResizeOperation', callback);
        },
        /**
         * Listen to NodeMoveZOperations
         * Equivalent to onNode(['NodeMoveZOperation'], callback, id);
         * @param {onNodeMoveZCallback} callback - the callback if a node is moved to the back- or foreground on the canvas
         * @param {string} id - id of the node to listen to. If null we listen to all
         * @see OnNode
         */
        onNodeMoveZ: function (callback) {
            if (!ySyncMetaInstance)
                return new Error('No Connection to Yjs space');
            onNode('NodeMoveZOperation', callback);
        },
        /**
         * Listen to changes on Attributes on nodes
         * Equivalent to onAttributeChange('nodes', callback, entityId);
         * @param {onAttributeChangeCallback} callback - calls back if a attribute is changed
         * @param {string} entityId - id of the node to listen to. If null we listen to all of the specified type
         * @see OnAttributeChange
         */
        onNodeAttributeChange: function (callback) {
            onAttributeChange('nodes', callback);
        },
        /**
         * Listen to changes on Attributes on edges
         * Equivalent to onAttributeChange('edges', callback, entityId);
         * @param {onAttributeChangeCallback} callback - calls back if a attribute is changed
         * @param {string} entityId - id of the edge to listen to. If null we listen to all of the specified type
         * @see OnAttributeChange
         */
        onEdgeAttributeChange: function (callback) {
            onAttributeChange('edges', callback);
        },
        /**
         * Set a value for a attribute of a entity
         * @param {stirng} entity
         * @param {string} attrName
         * @param {string|bool|integer} value
         */
        setAttributeValue: function (entityId, attrName, value) {
            var idx = ySyncMetaInstance.share.nodes.keys().indexOf(entityId);

            var attrId;
            //Does attrName has the form of the id
            if (attrName.search(/\w*\[(\w|\s)*\]/g) != -1)
                //Yes, the attribute name is the attribute id
                attrId = attrName;
            else
                //No, build the attribute id
                attrId = entityId + '[' + attrName.toLowerCase() + ']';

            var findAttr = function (ymap, attrId, value) {
                var keys = ymap.keys().indexOf(attrId);
                if (keys != -1) {
                    var attr = ymap.get(attrId);

                    if (attr instanceof Y.Text.typeDefinition.class) {
                        var ytext = attr;

                        var l = ytext.toString().length;
                        if (l > 0) {
                            ytext.delete(0, l);
                        }
                        ytext.insert(0, value);
                        //lets wait a bit before trigger the save
                        // so that the canvas and attribute widget can process the value change at their callbacks
                        setTimeout(function () {
                            if (jabberId)
                                ySyncMetaInstance.share.canvas.set('triggerSave', jabberId);
                        }, 500);
                    } else
                        ymap.set(attrId, {
                            'entityId': attrId,
                            'value': value,
                            'type': 'update',
                            'position': 0
                        });
                } else
                    ymap.set(attrId, {
                        'entityId': attrId,
                        'value': value,
                        'type': 'update',
                        'position': 0
                    });
            }

            if (idx != -1) {
                var ymap = ySyncMetaInstance.share.nodes.get(entityId);
                findAttr(ymap, attrId, value);
            } else {
                idx = ySyncMetaInstance.share.edges.keys().indexOf(entityId);
                if (idx != -1) {
                    var ymap = ySyncMetaInstance.share.edges.get(entityId);
                    findAttr(ymap, attrId, value);
                } else {
                    return;
                }
            }
        },
        /**
         * Create a node 
         * @param {String} type the type of the node
         * @param {integer} left the x-coordinate
         * @param {integer} top the y-coordinate
         * @param {integer} width the width of the node 
         * @param {integer} height the height of the node
         * @param {integer} zIndex the z-index of the node
         * @param {Object} json some json date
         * @param {string} id the id of the node
         * @returns returns the id of the created node as string
         */
        createNode: function (type, left, top, width, height, zIndex, json, id) {
            var metamodel = ySyncMetaInstance.share.data.get('metamodel');

            if (!id)
                id = generateRandomId();

            var _ymap = ySyncMetaInstance.share.nodes.set(id, Y.Map);
            if (metamodel) {
                createYTextsForEntityType(metamodel, id, "nodes", type, _ymap);
            } else {
                _ymap.set(id + '[label]', Y.Text);
                if (type === 'Node Shape') {
                    _ymap.set(id + '[color]', Y.Text);
                    _ymap.set(id + '[customAnchors]', Y.Text);
                    _ymap.set(id + '[customShape]', Y.Text);
                } else if (type === 'Edge Shape') {
                    _ymap.set(id + '[color]', Y.Text);
                    _ymap.set(id + '[overlay]', Y.Text);
                }
            }
            _ymap.set('left', left);
            _ymap.set('top', top);
            _ymap.set('width', width);
            _ymap.set('height', height);
            _ymap.set('zIndex', zIndex);
            _ymap.set('type', type);
            _ymap.set('id', id);
            if (json) _ymap.set('json', json);
            _ymap.set('jabberId', jabberId);

            ySyncMetaInstance.share.canvas.set('NodeAddOperation', {
                id: id,
                type: type,
                left: left,
                top: top,
                width: width,
                height: height,
                zIndex: zIndex,
                json: json,
                viewId: undefined,
                oType: undefined,
                jabberId: jabberId
            });
            setTimeout(function () {
                if (jabberId)
                    ySyncMetaInstance.share.canvas.set('triggerSave', jabberId);
            }, 500);
            return id;
        },
        /**
         * delete a node
         * @param {string} id of the node to delete
         */
        deleteNode: function (entityId) {
            ySyncMetaInstance.share.nodes.delete(entityId);
        },
        /**
         * create a edge
         * @param {string} type type of the edge
         * @param {source} source the id of the source node
         * @param {target} target the id of the target node
         * @param {Object} json some additional data
         */
        createEdge: function (type, source, target, json) {
            var id = generateRandomId();
            setTimeout(function () {
                var metamodel = ySyncMetaInstance.share.data.get('metamodel');

                var _ymap = ySyncMetaInstance.share.edges.set(id, Y.Map);
                if (metamodel) {
                    createYTextsForEntityType(metamodel, id, "edges", type, _ymap);
                } else {
                    _ymap.set(id + '[label]', Y.Text);
                }
                _ymap.set('id', id);
                _ymap.set('type', type);
                _ymap.set('source', source);
                _ymap.set('target', target);
                _ymap.set('jabberId', jabberId);
                //if source and target nodes are created previously just wait here for a 

                ySyncMetaInstance.share.canvas.set('EdgeAddOperation', {
                    id: id,
                    type: type,
                    source: source,
                    target: target,
                    json: json,
                    viewId: undefined,
                    oType: undefined,
                    jabberId: jabberId
                });

                setTimeout(function () {
                    if (jabberId)
                        ySyncMetaInstance.share.canvas.set('triggerSave', jabberId);
                }, 100);
            }, 200);
            return id;
        },
        /**
         * Delete a edge
         * @param {string} the id of the edge to delete
         */
        deleteEdge: function (entityId) {
            ySyncMetaInstance.share.edges.delete(entityId);
        },
        /**
         * Applies the drage layout 
         */
        applyLayout: function () {
            ySyncMetaInstance.share.canvas.set('applyLayout', true);
        }

        /**
         * @callback onNodeAddCallback
         * @param {object} event - the NodeAddOperation event
         * @param {string} event.id - the id of the created node
         * @param {string} event.type - the type of the node
         * @param {string} event.oType - the original type (only set in views, then type is the view type)
         * @param {integer} event.top - y position in the canvas
         * @param {integer} event.left - x position in the canvas
         * @param {integer} event.width - width of the node
         * @param {integer} event.height - height of the node
         * @param {integer} event.zIndex - depth value of the node
         * @param {object} event.json - the json representation. Only used for import of (meta-)models. Should be always null
         * @param {string} event.jabberId - jabberId of the user who created the node
         *
         */

        /**
         * @callback onEdgeAddCallback
         * @param {object} event - the EdgeAddOperation event
         * @param {string} event.id - the id of the created edge
         * @param {string} event.jabberId - jabberId of the user who created the edge
         * @param {string} event.type - the type of the edge
         * @param {string} event.oType - the original type (only set in views, then type is the view type)
         * @param {object} event.json - the json representation. Only used for import of (meta-)models. Should be always null
         * @param {string} event.source - the source of the edge
         * @param {string} event.target - the target of the edge
         */

        /**
         * @callback onEntitySelectCallback
         * @param {string} id - the id of the selected entity (node/edge)
         */

        /**
         * @callback onEntityDeleteCallback
         * @param {string} id - the id of the deleted entity (node/edge)
         */

        /**
         * @callback onNodeMoveCallback
         * @param {object} event - the node move operation
         * @param {string} event.id - the id of node
         * @param {string} event.jabberId - the jabberId of the user
         * @param {integer} event.offsetX
         * @param {integer} event.offsetY
         */

        /**
         *@callback onNodeResizeCallback
         * @param {object} event - the node resize operation
         * @param {string} event.id - the id of node
         * @param {string} event.jabberId - the jabberId of the user
         * @param {integer} event.offsetX
         * @param {integer} event.offsetY
         * */

        /**
         * @callback onNodeMoveZCallback
         * @param {object} event - the NodeMoveZOperation
         * @param {string} event.id - the id of the node
         * @param {integer} event.offsetZ - the offset of the z coordinate
         */

        /**
         * @callback onAttributeChangeCallback
         * @param {string} value - the new value of the attribute
         * @param {string} entityId - the id of the entity (node/edge) the attribute belongs to
         * @param {string} attrId - the id of the attribute
         */
    }
}));