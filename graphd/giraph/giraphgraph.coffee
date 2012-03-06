fs = require "fs"
path = require "path"
{spawn} = require "child_process"

{StateMachineGraph} = require "../statemachinegraph"

class GiraphGraph extends StateMachineGraph
    constructor: (@descriptor, @basepath) ->
        super @descriptor, @basepath
        d = @descriptor
        unless d.graphPath?
            throw new Error "graphPath, ... are required for the graph descriptor"
        # populate schema from descriptor
        objects = {}
        for nodeTypeId,nodeType of d.nodes
            o = objects[nodeType.type] =
                Attributes: nodeType.props
                Label: nodeType.label
            o.Links = {}
            nodeTypeId = parseInt nodeTypeId
            for edgeTypeId,edgeType of d.edges when nodeTypeId in edgeType.domain
                l = o.Links[edgeType.type] ?= []
                l.push d.nodes[rangeNodeTypeId].type for rangeNodeTypeId in edgeType.range
        @schema.Objects = objects

    _runStateMachine: (statemachine, limit, offset, req, res, q) ->
        # generate Pregel vertex code from statemachine
        javaCode = @generateJavaCode statemachine
        # FIXME for debug
        javaFile = "test.java"
        fs.writeFileSync javaFile, javaCode
        # indent with Vim
        spawn "screen", [
            "-D"
            "-m"
            "vim"
            "-n"
            "+set sw=2 sts=2"
            "+norm gg=G"
            "+wq"
            javaFile
        ]
        # FIXME end of debug
        #  TODO map types, node/edge URIs in query to long long int IDs
        run = spawn "./giraph/run-smallgraph-on-giraph", [
            "SmallGraphGiraphVertex"
            path.join @basepath, @descriptor.graphPath
        ]
        rawResults = ""
        run.stderr.setEncoding 'utf-8'
        run.stderr.pipe process.stderr, { end: false }
        run.stdout.setEncoding 'utf-8'
        run.stdout.on 'data', (chunk) ->
            # collect raw matches
            rawResults += chunk
        run.on 'exit', (code, signal) ->
            switch code
                when 0
                    # TODO collect results
                    result = [rawResults]
                    # TODO  inverse-map long long int IDs back to types, node/edge URIs
                    q.emit 'result', result
                else
                    q.emit 'error', new Error "run-smallgraph-on-giraph ended with #{code}:\n" +
                        "#{rawResults.split(/\n/).map((l) -> "    "+l).join("\n")}"
        run.stdin.end javaCode, 'utf-8'
    generateJavaCode: (statemachine) ->
        codegenType = (expr) ->
            if expr.targetNodeOf?
                "LongWritable"
            else if expr.nodesBeforeWalk?
                { list: "LongWritable" }
            else if expr.outgoingEdgesOf?
                { list: "LongWritable" }

            else if expr.newPath?
                "MatchPath"

            else if expr.findCompatibleMatchesWithMatches?
                { list: "Matches" }
            else if expr.newMatches?
                "Matches"

            else
                "/* XXX: unknown type for expr: #{JSON.stringify expr} */ void"

        codegenName = (sym) ->
            # TODO check and generate unique symbols?
            codegenExpr sym

        codegenNodeIdExpr = (expr) ->
            if typeof expr == 'string' and expr == '$this'
                "#{codegenExpr expr}.getVertexId().get()"
            else
                codegenExpr expr

        codegenEdgeIdExpr = (expr) ->
            if typeof expr == 'string' and expr == '$e'
                "#{codegenExpr expr}.get()"
            else
                codegenExpr expr

        codegenExpr = (expr) ->
            switch typeof expr
                when 'string'
                    if expr.match /^\$/ # symbol
                        return expr.replace /^\$/, ""
                    else # string literal
                        return "\"#{expr.replace /"/g, "\\\""}\""
                when 'number' # number literal
                    return expr
                when 'object'
                    true
                else
                    return "/* XXX: invalid expression of type #{typeof expr}: #{JSON.stringify expr} */ null"

            if expr.targetNodeOf?
                codegenExpr expr.targetNodeOf
            else if expr.nodesBeforeWalk?
                "#{
                    codegenExpr expr.inMatches
                }.getVertexIdsOfMatchesForWalk(#{
                    codegenExpr expr.nodesBeforeWalk
                })"

            else if expr.outgoingEdgesOf?
                codegenExpr expr.outgoingEdgesOf

            else if expr.newPath?
                newPathArgs = []
                if expr.newPath
                    newPathArgs.push codegenExpr expr.newPath
                if expr.augmentedWithNode?
                    newPathArgs.push codegenNodeIdExpr expr.augmentedWithNode
                else if expr.augmentedWithEdge?
                    # XXX EdgeListVertex has no ID for edges
                    newPathArgs.push codegenEdgeIdExpr expr.augmentedWithEdge
                # TODO collect attribute/property values
                "new MatchPath(#{newPathArgs.join ", "})"

            else if expr.findCompatibleMatchesWithMatches?
                # TODO can we expand this?
                "getAllConsistentMatches(#{codegenExpr expr.findCompatibleMatchesWithMatches}, #{
                        expr.ofWalks.join ", "})"
            else if expr.newMatchesAtNode?
                "new Matches(#{codegenNodeIdExpr expr.newMatchesAtNode})"

            else
                "/* XXX: unknown expr: #{JSON.stringify expr} */ null"

        codegenConstraints = (pmap, constraints) ->
            codegenSingleConstraint = (c) ->
                [name, rel, value] = c
                if name?
                    switch typeof value
                        when "number"
                            if value == parseInt value
                                "#{pmap}.getLong(#{name}) #{rel} #{value}"
                            else
                                "#{pmap}.getDouble(#{name}) #{rel} #{value}"
                        when "string"
                            "#{pmap}.getString(#{name}) #{rel} \"#{value.replace /"/g, "\\\""}\""
                        else
                            "false /* XXX: unable to compile constraint: #{JSON.stringify c} */"
                else
                    "#{eV} #{rel} #{value}"
            if constraints? and constraints.length > 0 and constraints[0]? and constraints[0].length > 0
                code = "if ("
                numdisjs = 0
                for disjunction in constraints
                    if disjunction.length > 0
                        code += " && " if numdisjs > 0
                        code += "(#{disjunction.map(codegenSingleConstraint).join(" || ")})"
                        numdisjs++
                code
            else
                ""

        codegenAction = (action) ->
            if action instanceof Array
                if action.length == 1
                    codegenAction action[0]
                else
                    """
                    {
                        #{(codegenAction a for a in action).join "\n"}
                    }
                    """

            else if action.foreach?
                if typeof action.in == 'object'
                    xsty = codegenType action.in
                    xty = xsty?.list ? "Object"
                    """
                    for (#{xty} #{codegenExpr action.foreach} : #{codegenExpr action.in})
                        #{codegenAction action.do}
                    """
                else
                    """
                    // XXX unknown iteration target for foreach: #{JSON.stringify action}
                    """

            else if action.let?
                """
                {
                    #{codegenType action.be} #{codegenName action.let} = #{codegenExpr action.be};
                    #{codegenAction action.in}
                }
                """

            else if action.emitMatches?
                """
                emitMatches(#{codegenExpr action.emitMatches});
                """

            else if action.sendMessage?
                """
                this.sendMsg(#{codegenNodeIdExpr action.to}, new MatchingMessage(#{codegenExpr action.sendMessage}#{
                    if action.withMatches? then ", " + codegenExpr action.withMatches else ""
                }#{
                    if action.withPath? then ", " + codegenExpr action.withPath else ""
                }));
                """

            else if action.whenEdge?
                cond = action.satisfies
                # TODO edgeTypeId = typeDictionary cond.linkType
                edgeTypeId = codegenExpr cond.linkType
                """
                {
                PropertyMap eV = this.getEdgeValue(#{codegenExpr action.whenEdge});
                if (#{edgeTypeId}.equals(eV.getType())) #{codegenConstraints "eV", cond.constraints}
                    #{codegenAction action.then}
                }
                """
            else if action.whenNode?
                cond = action.satisfies
                # TODO map to typeId: nodeTypeId = typeDictionary cond.objectType
                nodeTypeId = codegenExpr cond.objectType
                """
                if (#{nodeTypeId}.equals(#{codegenExpr action.whenNode}.getVertexValue().getType())) #{codegenConstraints (codegenExpr action.whenNode), cond.constraints}
                    #{codegenAction action.then}
                """

            else if action.rememberMatches?
                if action.ofNode != "$this"
                    """
                    // XXX can't remember matches of node: #{action.ofNode}
                    """
                else if action.viaWalk?
                    """
                    this.getVertexValue().getMatches().addPathWithMatchesArrived(#{codegenExpr action.viaWalk}, #{codegenExpr action.withPath}, #{codegenExpr action.rememberMatches});
                    """
                else if action.returnedFromWalk?
                    """
                    this.getVertexValue().getMatches().addMatchesReturned(#{codegenExpr action.returnedFromWalk}, #{codegenExpr action.rememberMatches});
                    """

            else
                "// unknown action node: #{JSON.stringify action}"

        codegenSingleHandler = (msg) ->
            a = """
            case #{msg.msgId}:
                // #{msg.description}
                #{codegenAction msg.action}
                break;
            """
        pass = 0
        codegenHandlers = (msgs) ->
            """
            void handleMessage#{pass++}(int msgId, MatchPath path, Matches matches) {
                switch (msgId) {
                    #{msgs.map(codegenSingleHandler).join "\n"}
                }
            }

            """

        codegenComputeLoop = (msgs) ->
            (
                for i in [0 .. pass-1] by 1
                    """
                    for (MatchingMessage msg : messages)
                        handleMessage#{i}(msg.getMessageId(), msg.getPath(), msg.getMatches());
                    """
            ).join "\n"

        """
        import org.apache.hadoop.io.LongWritable;

        import edu.stanford.smallgraphs.BaseSmallGraphGiraphVertex;
        import edu.stanford.smallgraphs.MatchPath;
        import edu.stanford.smallgraphs.Matches;
        import edu.stanford.smallgraphs.MatchingMessage;
        import edu.stanford.smallgraphs.PropertyMap;

        public class SmallGraphGiraphVertex extends BaseSmallGraphGiraphVertex  {

        #{statemachine.messages.map(codegenHandlers).join "\n"}

        @Override
	public void handleMessages(Iterable<MatchingMessage> messages) {
            #{codegenComputeLoop statemachine.messages}
        }

        }
        """


exports.GiraphGraph = GiraphGraph