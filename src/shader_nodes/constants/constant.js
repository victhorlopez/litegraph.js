
//Constant
function LGraphConstant()
{
    this.addOutput("value","float", {float:1});
    this.properties = { value:1.0 };

    this.editable = { property:"value", type:"float" };
    this.shader_piece = new PConstant("float"); // hardcoded for testing
}

LGraphConstant.title = "Number";
LGraphConstant.desc = "Constant value";


LGraphConstant.prototype.setValue = function(v)
{
    if( typeof(v) == "string") v = parseFloat(v);
    this.properties["value"] = v;
    this.setDirtyCanvas(true);
};

LGraphConstant.prototype.onExecute = function()
{
//    this.processNodePath();

    this.setOutputData(0, parseFloat( this.properties["value"] ) );
}

//LGraphConstant.prototype.processNodePath = function()
//{
//    var input = {};
//    this.insertIntoPath(input);
//    this.node_path[0] = input;
//}

LGraphConstant.prototype.processInputCode = function(scope)
{
    this.codes[0] = this.shader_piece.getCode(
        { out_var:"float_"+this.id,
            a:this.properties["value"].toFixed(3),
            is_global:this.properties.is_global,
            scope:scope,
            order:this.order
        }); // need to check scope

}

LGraphConstant.prototype.onDrawBackground = function(ctx)
{
    //show the current value
    this.outputs[0].label = this.properties["value"].toFixed(3);
}

LGraphConstant.prototype.onWidget = function(e,widget)
{
    if(widget.name == "value")
        this.setValue(widget.value);
}

LGraphConstant.prototype.callbackIsGlobal = function(  )
{
    this.options.global_name.hidden = !this.properties.is_global;
    this.setGlobalColor();
    if(this.id in this.graph.globals)
        delete this.graph.globals[this.id];
    else{
        this.graph.globals[this.id] = {name:"float_"+this.id, value: this.properties , getValue:function(){return this.value.value}};
    }


}

LiteGraph.registerNodeType("constants/"+LGraphConstant.title, LGraphConstant);
