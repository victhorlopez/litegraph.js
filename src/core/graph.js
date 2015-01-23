
//*********************************************************************************
// LGraph CLASS                                  
//*********************************************************************************

require(LiteGraph);
declare(LGraph);

/**
 * LGraph is the class that contain a full graph. We instantiate one and add nodes to it, and then we can run the execution loop.
 *
 * @class LGraph
 * @constructor
 */

function LGraph()
{
    if (LiteGraph.debug)
        console.log("Graph created");
    this.list_of_graphcanvas = null;
    this.clear();
}

//default supported types
LGraph.supported_types = ["number","string","boolean"];

//used to know which types of connections support this graph (some graphs do not allow certain types)
LGraph.prototype.getSupportedTypes = function() { return this.supported_types || LGraph.supported_types; }

LGraph.STATUS_STOPPED = 1;
LGraph.STATUS_RUNNING = 2;

/**
 * Removes all nodes from this graph
 * @method clear
 */

LGraph.prototype.clear = function()
{
    this.stop();
    this.status = LGraph.STATUS_STOPPED;
    this.last_node_id = 0;

    //nodes
    this._nodes = [];
    this._nodes_by_id = {};

    //links
    this.last_link_id = 0;
    this.links = {}; //container with all the links

    //iterations
    this.iteration = 0;

    this.config = {
    };

    //timing
    this.globaltime = 0;
    this.runningtime = 0;
    this.fixedtime =  0;
    this.fixedtime_lapse = 0.01;
    this.elapsed_time = 0.01;
    this.starttime = 0;

    //globals
    this.global_inputs = {};
    this.global_outputs = {};

    //this.graph = {};
    this.debug = true;

    this.change();

    this.sendActionToCanvas("clear");
}

/**
 * Attach Canvas to this graph
 * @method attachCanvas
 * @param {GraphCanvas} graph_canvas
 */

LGraph.prototype.attachCanvas = function(graphcanvas)
{
    if(graphcanvas.constructor != LGraphCanvas)
        throw("attachCanvas expects a LGraphCanvas instance");
    if(graphcanvas.graph && graphcanvas.graph != this)
        graphcanvas.graph.detachCanvas( graphcanvas );

    graphcanvas.graph = this;
    if(!this.list_of_graphcanvas)
        this.list_of_graphcanvas = [];
    this.list_of_graphcanvas.push(graphcanvas);
}

/**
 * Detach Canvas from this graph
 * @method detachCanvas
 * @param {GraphCanvas} graph_canvas
 */

LGraph.prototype.detachCanvas = function(graphcanvas)
{
    var pos = this.list_of_graphcanvas.indexOf(graphcanvas);
    if(pos == -1) return;
    graphcanvas.graph = null;
    this.list_of_graphcanvas.splice(pos,1);
}

/**
 * Starts running this graph every interval milliseconds.
 * @method start
 * @param {number} interval amount of milliseconds between executions, default is 1
 */

LGraph.prototype.start = function(interval)
{
    if(this.status == LGraph.STATUS_RUNNING) return;
    this.status = LGraph.STATUS_RUNNING;

    if(this.onPlayEvent)
        this.onPlayEvent();

    this.sendEventToAllNodes("onStart");

    //launch
    this.starttime = LiteGraph.getTime();
    interval = interval || 1;
    var that = this;

    this.execution_timer_id = setInterval( function() {
        //execute
        that.runStep(1);
    },interval);
}

/**
 * Stops the execution loop of the graph
 * @method stop execution
 */

LGraph.prototype.stop = function()
{
    if(this.status == LGraph.STATUS_STOPPED)
        return;

    this.status = LGraph.STATUS_STOPPED;

    if(this.onStopEvent)
        this.onStopEvent();

    if(this.execution_timer_id != null)
        clearInterval(this.execution_timer_id);
    this.execution_timer_id = null;

    this.sendEventToAllNodes("onStop");
}

/**
 * Run N steps (cycles) of the graph
 * @method runStep
 * @param {number} num number of steps to run, default is 1
 */

LGraph.prototype.runStep = function(num)
{
    num = num || 1;

    var start = LiteGraph.getTime();
    this.globaltime = 0.001 * (start - this.starttime);

    try
    {
        for(var i = 0; i < num; i++)
        {
            this.sendEventToAllNodes("onExecute");
            this.fixedtime += this.fixedtime_lapse;
            if( this.onExecuteStep )
                this.onExecuteStep();
        }

        if( this.onAfterExecute )
            this.onAfterExecute();
        this.errors_in_execution = false;
    }
    catch (err)
    {
        this.errors_in_execution = true;
        if(LiteGraph.throw_errors)
            throw err;
        if(LiteGraph.debug)
            console.log("Error during execution: " + err);
        this.stop();
    }

    var elapsed = LiteGraph.getTime() - start;
    if (elapsed == 0) elapsed = 1;
    this.elapsed_time = 0.001 * elapsed;
    this.globaltime += 0.001 * elapsed;
    this.iteration += 1;
}

/**
 * Updates the graph execution order according to relevance of the nodes (nodes with only outputs have more relevance than
 * nodes with only inputs.
 * @method updateExecutionOrder
 */

LGraph.prototype.updateExecutionOrder = function()
{
    this._nodes_in_order = this.computeExecutionOrder();
}

//This is more internal, it computes the order and returns it
LGraph.prototype.computeExecutionOrder = function()
{
    var L = [];
    var S = [];
    var M = {};
    var visited_links = {}; //to avoid repeating links
    var remaining_links = {}; //to a

    //search for the nodes without inputs (starting nodes)
    for (var i in this._nodes)
    {
        var n = this._nodes[i];
        M[n.id] = n; //add to pending nodes

        var num = 0; //num of input connections
        if(n.inputs)
            for(var j = 0, l = n.inputs.length; j < l; j++)
                if(n.inputs[j] && n.inputs[j].link != null)
                    num += 1;

        if(num == 0) //is a starting node
            S.push(n);
        else //num of input links
            remaining_links[n.id] = num;
    }

    while(true)
    {
        if(S.length == 0)
            break;

        //get an starting node
        var n = S.shift();
        L.push(n); //add to ordered list
        delete M[n.id]; //remove from the pending nodes

        //for every output
        if(n.outputs)
            for(var i = 0; i < n.outputs.length; i++)
            {
                var output = n.outputs[i];
                //not connected
                if(output == null || output.links == null || output.links.length == 0)
                    continue;

                //for every connection
                for(var j = 0; j < output.links.length; j++)
                {
                    var link_id = output.links[j];
                    var link = this.links[link_id];
                    if(!link) continue;

                    //already visited link (ignore it)
                    if(visited_links[ link.id ])
                        continue;

                    var target_node = this.getNodeById( link.target_id );
                    if(target_node == null)
                    {
                        visited_links[ link.id ] = true;
                        continue;
                    }

                    visited_links[link.id] = true; //mark as visited
                    remaining_links[target_node.id] -= 1; //reduce the number of links remaining
                    if (remaining_links[target_node.id] == 0)
                        S.push(target_node); //if no more links, then add to Starters array
                }
            }
    }

    //the remaining ones (loops)
    for(var i in M)
        L.push(M[i]);

    if(L.length != this._nodes.length && LiteGraph.debug)
        console.log("something went wrong, nodes missing");

    //save order number in the node
    for(var i in L)
        L[i].order = i;

    return L;
}


/**
 * Returns the amount of time the graph has been running in milliseconds
 * @method getTime
 * @return {number} number of milliseconds the graph has been running
 */

LGraph.prototype.getTime = function()
{
    return this.globaltime;
}

/**
 * Returns the amount of time accumulated using the fixedtime_lapse var. This is used in context where the time increments should be constant
 * @method getFixedTime
 * @return {number} number of milliseconds the graph has been running
 */

LGraph.prototype.getFixedTime = function()
{
    return this.fixedtime;
}

/**
 * Returns the amount of time it took to compute the latest iteration. Take into account that this number could be not correct
 * if the nodes are using graphical actions
 * @method getElapsedTime
 * @return {number} number of milliseconds it took the last cycle
 */

LGraph.prototype.getElapsedTime = function()
{
    return this.elapsed_time;
}

/**
 * Sends an event to all the nodes, useful to trigger stuff
 * @method sendEventToAllNodes
 * @param {String} eventname the name of the event
 * @param {Object} param an object containing the info
 */

LGraph.prototype.sendEventToAllNodes = function(eventname, param)
{
    var M = this._nodes_in_order ? this._nodes_in_order : this._nodes;
    for(var j in M)
        if(M[j][eventname])
            M[j][eventname](param);
}

LGraph.prototype.sendActionToCanvas = function(action, params)
{
    if(!this.list_of_graphcanvas)
        return;

    for(var i in this.list_of_graphcanvas)
    {
        var c = this.list_of_graphcanvas[i];
        if( c[action] )
            c[action].apply(c, params);
    }
}

/**
 * Adds a new node instasnce to this graph
 * @method add
 * @param {LGraphNode} node the instance of the node
 */

LGraph.prototype.add = function(node, skip_compute_order)
{
    if(!node || (node.id != -1 && this._nodes_by_id[node.id] != null))
        return; //already added

    if(this._nodes.length >= LiteGraph.MAX_NUMBER_OF_NODES)
        throw("LiteGraph: max number of nodes in a graph reached");

    //give him an id
    if(node.id == null || node.id == -1)
        node.id = this.last_node_id++;


    node.graph = this;

    this._nodes.push(node);
    this._nodes_by_id[node.id] = node;

    /*
     // rendering stuf...
     if(node.bgImageUrl)
     node.bgImage = node.loadImage(node.bgImageUrl);
     */

    if(node.onAdded)
        node.onAdded();

    if(this.config.align_to_grid)
        node.alignToGrid();

    if(!skip_compute_order)
        this.updateExecutionOrder();

    if(this.onNodeAdded)
        this.onNodeAdded(node);


    this.setDirtyCanvas(true);

    this.change();

    return node; //to chain actions
}

/**
 * Removes a node from the graph
 * @method remove
 * @param {LGraphNode} node the instance of the node
 */

LGraph.prototype.remove = function(node)
{
    if(this._nodes_by_id[node.id] == null)
        return; //not found

    if(node.ignore_remove)
        return; //cannot be removed

    //disconnect inputs
    if(node.inputs)
        for(var i = 0; i < node.inputs.length; i++)
        {
            var slot = node.inputs[i];
            if(slot.link != null)
                node.disconnectInput(i);
        }

    //disconnect outputs
    if(node.outputs)
        for(var i = 0; i < node.outputs.length; i++)
        {
            var slot = node.outputs[i];
            if(slot.links != null && slot.links.length)
                node.disconnectOutput(i);
        }

    node.id = -1;

    //callback
    if(node.onRemoved)
        node.onRemoved();

    node.graph = null;

    //remove from canvas render
    for(var i in this.list_of_graphcanvas)
    {
        var canvas = this.list_of_graphcanvas[i];
        if(canvas.selected_nodes[node.id])
            delete canvas.selected_nodes[node.id];
        if(canvas.node_dragged == node)
            canvas.node_dragged = null;
    }

    //remove from containers
    var pos = this._nodes.indexOf(node);
    if(pos != -1)
        this._nodes.splice(pos,1);
    delete this._nodes_by_id[node.id];

    if(this.onNodeRemoved)
        this.onNodeRemoved(node);

    this.setDirtyCanvas(true,true);

    this.change();

    this.updateExecutionOrder();
}

/**
 * Returns a node by its id.
 * @method getNodeById
 * @param {String} id
 */

LGraph.prototype.getNodeById = function(id)
{
    if(id==null) return null;
    return this._nodes_by_id[id];
}


/**
 * Returns a list of nodes that matches a type
 * @method findNodesByType
 * @param {String} type the name of the node type
 * @return {Array} a list with all the nodes of this type
 */

LGraph.prototype.findNodesByType = function(type)
{
    var r = [];
    for(var i in this._nodes)
        if(this._nodes[i].type == type)
            r.push(this._nodes[i]);
    return r;
}

/**
 * Returns a list of nodes that matches a name
 * @method findNodesByName
 * @param {String} name the name of the node to search
 * @return {Array} a list with all the nodes with this name
 */

LGraph.prototype.findNodesByTitle = function(title)
{
    var result = [];
    for (var i in this._nodes)
        if(this._nodes[i].title == title)
            result.push(this._nodes[i]);
    return result;
}

/**
 * Returns the top-most node in this position of the canvas
 * @method getNodeOnPos
 * @param {number} x the x coordinate in canvas space
 * @param {number} y the y coordinate in canvas space
 * @param {Array} nodes_list a list with all the nodes to search from, by default is all the nodes in the graph
 * @return {Array} a list with all the nodes that intersect this coordinate
 */

LGraph.prototype.getNodeOnPos = function(x,y, nodes_list)
{
    nodes_list = nodes_list || this._nodes;
    for (var i = nodes_list.length - 1; i >= 0; i--)
    {
        var n = nodes_list[i];
        if(n.isPointInsideNode(x,y))
            return n;
    }
    return null;
}

// ********** GLOBALS *****************

//Tell this graph has a global input of this type
LGraph.prototype.addGlobalInput = function(name, type, value)
{
    this.global_inputs[name] = { name: name, type: type, value: value };

    if(this.onGlobalInputAdded)
        this.onGlobalInputAdded(name, type);

    if(this.onGlobalsChange)
        this.onGlobalsChange();
}

//assign a data to the global input
LGraph.prototype.setGlobalInputData = function(name, data)
{
    var input = this.global_inputs[name];
    if (!input)
        return;
    input.value = data;
}

//assign a data to the global input
LGraph.prototype.getGlobalInputData = function(name)
{
    var input = this.global_inputs[name];
    if (!input)
        return null;
    return input.value;
}

//rename the global input
LGraph.prototype.renameGlobalInput = function(old_name, name)
{
    if(name == old_name)
        return;

    if(!this.global_inputs[old_name])
        return false;

    if(this.global_inputs[name])
    {
        console.error("there is already one input with that name");
        return false;
    }

    this.global_inputs[name] = this.global_inputs[old_name];
    delete this.global_inputs[old_name];

    if(this.onGlobalInputRenamed)
        this.onGlobalInputRenamed(old_name, name);

    if(this.onGlobalsChange)
        this.onGlobalsChange();
}

LGraph.prototype.changeGlobalInputType = function(name, type)
{
    if(!this.global_inputs[name])
        return false;

    if(this.global_inputs[name].type == type)
        return;

    this.global_inputs[name].type = type;
    if(this.onGlobalInputTypeChanged)
        this.onGlobalInputTypeChanged(name, type);
}

LGraph.prototype.removeGlobalInput = function(name)
{
    if(!this.global_inputs[name])
        return false;

    delete this.global_inputs[name];

    if(this.onGlobalInputRemoved)
        this.onGlobalInputRemoved(name);

    if(this.onGlobalsChange)
        this.onGlobalsChange();
    return true;
}


LGraph.prototype.addGlobalOutput = function(name, type, value)
{
    this.global_outputs[name] = { name: name, type: type, value: value };

    if(this.onGlobalOutputAdded)
        this.onGlobalOutputAdded(name, type);

    if(this.onGlobalsChange)
        this.onGlobalsChange();
}

//assign a data to the global output
LGraph.prototype.setGlobalOutputData = function(name, value)
{
    var output = this.global_outputs[ name ];
    if (!output)
        return;
    output.value = value;
}

//assign a data to the global input
LGraph.prototype.getGlobalOutputData = function(name)
{
    var output = this.global_outputs[name];
    if (!output)
        return null;
    return output.value;
}


//rename the global output
LGraph.prototype.renameGlobalOutput = function(old_name, name)
{
    if(!this.global_outputs[old_name])
        return false;

    if(this.global_outputs[name])
    {
        console.error("there is already one output with that name");
        return false;
    }

    this.global_outputs[name] = this.global_outputs[old_name];
    delete this.global_outputs[old_name];

    if(this.onGlobalOutputRenamed)
        this.onGlobalOutputRenamed(old_name, name);

    if(this.onGlobalsChange)
        this.onGlobalsChange();
}

LGraph.prototype.changeGlobalOutputType = function(name, type)
{
    if(!this.global_outputs[name])
        return false;

    if(this.global_outputs[name].type == type)
        return;

    this.global_outputs[name].type = type;
    if(this.onGlobalOutputTypeChanged)
        this.onGlobalOutputTypeChanged(name, type);
}

LGraph.prototype.removeGlobalOutput = function(name)
{
    if(!this.global_outputs[name])
        return false;
    delete this.global_outputs[name];

    if(this.onGlobalOutputRemoved)
        this.onGlobalOutputRemoved(name);

    if(this.onGlobalsChange)
        this.onGlobalsChange();
    return true;
}


/**
 * Assigns a value to all the nodes that matches this name. This is used to create global variables of the node that
 * can be easily accesed from the outside of the graph
 * @method setInputData
 * @param {String} name the name of the node
 * @param {*} value value to assign to this node
 */

LGraph.prototype.setInputData = function(name,value)
{
    var m = this.findNodesByName(name);
    for(var i in m)
        m[i].setValue(value);
}

/**
 * Returns the value of the first node with this name. This is used to access global variables of the graph from the outside
 * @method setInputData
 * @param {String} name the name of the node
 * @return {*} value of the node
 */

LGraph.prototype.getOutputData = function(name)
{
    var n = this.findNodesByName(name);
    if(n.length)
        return m[0].getValue();
    return null;
}

//This feature is not finished yet, is to create graphs where nodes are not executed unless a trigger message is received

LGraph.prototype.triggerInput = function(name,value)
{
    var m = this.findNodesByName(name);
    for(var i in m)
        m[i].onTrigger(value);
}

LGraph.prototype.setCallback = function(name,func)
{
    var m = this.findNodesByName(name);
    for(var i in m)
        m[i].setTrigger(func);
}


LGraph.prototype.onConnectionChange = function()
{
    this.updateExecutionOrder();
}

/**
 * returns if the graph is in live mode
 * @method isLive
 */

LGraph.prototype.isLive = function()
{
    for(var i in this.list_of_graphcanvas)
    {
        var c = this.list_of_graphcanvas[i];
        if(c.live_mode) return true;
    }
    return false;
}

/* Called when something visually changed */
LGraph.prototype.change = function()
{
    if(LiteGraph.debug)
        console.log("Graph changed");

    this.sendActionToCanvas("setDirty",[true,true]);

    if(this.on_change)
        this.on_change(this);
}

LGraph.prototype.setDirtyCanvas = function(fg,bg)
{
    this.sendActionToCanvas("setDirty",[fg,bg]);
}

//save and recover app state ***************************************
/**
 * Creates a Object containing all the info about this graph, it can be serialized
 * @method serialize
 * @return {Object} value of the node
 */
LGraph.prototype.serialize = function()
{
    var nodes_info = [];
    for (var i in this._nodes)
        nodes_info.push( this._nodes[i].serialize() );

    //remove data from links, we dont want to store it
    for (var i in this.links)
        this.links[i].data = null;


    var data = {
//		graph: this.graph,

        iteration: this.iteration,
        frame: this.frame,
        last_node_id: this.last_node_id,
        last_link_id: this.last_link_id,
        links: LiteGraph.cloneObject( this.links ),

        config: this.config,
        nodes: nodes_info
    };

    return data;
}


/**
 * Configure a graph from a JSON string
 * @method configure
 * @param {String} str configure a graph from a JSON string
 */
LGraph.prototype.configure = function(data, keep_old)
{
    if(!keep_old)
        this.clear();

    var nodes = data.nodes;

    //copy all stored fields
    for (var i in data)
        this[i] = data[i];

    var error = false;

    //create nodes
    this._nodes = [];
    for (var i in nodes)
    {
        var n_info = nodes[i]; //stored info
        var node = LiteGraph.createNode( n_info.type, n_info.title );
        if(!node)
        {
            if(LiteGraph.debug)
                console.log("Node not found: " + n_info.type);
            error = true;
            continue;
        }

        node.id = n_info.id; //id it or it will create a new id
        this.add(node, true); //add before configure, otherwise configure cannot create links
        node.configure(n_info);
    }

    this.updateExecutionOrder();
    this.setDirtyCanvas(true,true);
    return error;
}

LGraph.prototype.onNodeTrace = function(node, msg, color)
{
    //TODO
}