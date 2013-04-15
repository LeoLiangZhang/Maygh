#! /usr/bin/env python
'''
Created on Jan 31, 2012

@author: liang

Updates
ver.1.2 Tue Jul 31 19:22:03 EDT 2012
- Safe output final result by replace('//#import ', '//##import '), so that
  output file can be imported as a library without re-importing.

ver.1.1 Tue Jul 31 02:04:16 EDT 2012
- Added in_file_order in function sortfiles, to preserve implicit import order
  inside a importing file.

ver.1.0 Tue Mar 06 07:22:00 EDT 2012
- Stable release v1.0

'''

def _compile(paths, names,
            # These are optional fields, they are configure to work with JS.
            regex_import=None,
            regex_filename_filter=None,
            init_file=None):
    ''' Return a list of sorted absolute paths of files.
    '''

    import re, os, logging
    if not regex_import:
        regex_import = re.compile("(?<=^//#import\ )[^#\r\n]+$", re.MULTILINE)
    if not regex_filename_filter:
        regex_filename_filter = re.compile(r".*\.js")
    if not init_file:
        init_file = 'init.js'

    class Node(object):
        ''' Object to be compiled together. '''
        pass

    class FileNode(Node):
        ''' File object to be compiled. '''

        def __init__(self, abspath):
            self.abspath = abspath
            self.raw_data = None

        def read_raw(self):
            if self.raw_data is None:
                self.raw_data = open(self.abspath).read()
            return self.raw_data

    def _getnode():
        nodes = {}
        def getnode(abspath):
            ''' Return FileNode object whose abspath is equal to given abspath.

                Note: this function is depend on nodes variable.
            '''
            node = None
            if abspath in nodes:
                node = nodes[abspath]
            else:
                node = FileNode(abspath)
                nodes[abspath] = node
            return node
        return getnode
    getnode = _getnode(); del _getnode

    def findnodes(names, r_dir=os.getcwd()):
        ''' Find all FileNodes relative to r_dir. Default r_dir = os.getcwd().
        '''
        lst = []
        _paths = [r_dir] + paths
        for name in names:
            done = False
            for path in _paths:
                full = os.path.join(path, name)
                abspath = os.path.abspath(full)
                if os.path.isdir(abspath):
                    initfile = os.path.join(abspath, init_file)
                    if os.path.exists(initfile):
                        lst.append(getnode(initfile))
                        done = True
                        break
                    else:
                        items = os.listdir(abspath)
                        items = [os.path.join(abspath,i) for i in items]
                        items = filter(os.path.isfile, items)
                        items = filter(regex_filename_filter.match, items)
                        lst.extend([getnode(i) for i in items])
                        done = True
                        break
                elif os.path.isfile(abspath):
                    lst.append(getnode(abspath))
                    done = True
                    break
                elif os.path.exists(abspath):
                    logging.debug("Path %s is neither file or directory." %
                                  abspath)
            if not done:
                logging.error("Could not found {0}.".format(name));
        return lst

    def topological_sort(items, partial_order):
        """Perform topological sort.
           items is a list of items to be sorted.
           partial_order is a list of pairs. If pair (a,b) is in it, it means
           that item a should appear before item b.
           Returns a list of the items in one of the possible orders, or None
           if partial_order contains a loop.

           Copy from: http://www.bitformation.com/art/python_toposort.html
        """

        def add_node(graph, node):
            """Add a node to the graph if not already exists."""
            if not graph.has_key(node):
                graph[node] = [0] # 0 = number of arcs coming into this node.

        def add_arc(graph, fromnode, tonode):
            """Add an arc to a graph. Can create multiple arcs.
               The end nodes must already exist."""
            graph[fromnode].append(tonode)
            # Update the count of incoming arcs in tonode.
            graph[tonode][0] = graph[tonode][0] + 1

        # step 1 - create a directed graph with an arc a->b for each input
        # pair (a,b).
        # The graph is represented by a dictionary. The dictionary contains
        # a pair item:list for each node in the graph. /item/ is the value
        # of the node. /list/'s 1st item is the count of incoming arcs, and
        # the rest are the destinations of the outgoing arcs. For example:
        #           {'a':[0,'b','c'], 'b':[1], 'c':[1]}
        # represents the graph:   c <-- a --> b
        # The graph may contain loops and multiple arcs.
        # Note that our representation does not contain reference loops to
        # cause GC problems even when the represented graph contains loops,
        # because we keep the node names rather than references to the nodes.
        graph = {}
        for v in items:
            add_node(graph, v)
        for a,b in partial_order:
            add_arc(graph, a, b)

        # Step 2 - find all roots (nodes with zero incoming arcs).
        roots = [node for (node,nodeinfo) in graph.items() if nodeinfo[0] == 0]

        # step 3 - repeatedly emit a root and remove it from the graph. Removing
        # a node may convert some of the node's direct children into roots.
        # Whenever that happens, we append the new roots to the list of
        # current roots.
        _sorted = []
        while len(roots) != 0:
            # If len(roots) is always 1 when we get here, it means that
            # the input describes a complete ordering and there is only
            # one possible output.
            # When len(roots) > 1, we can choose any root to send to the
            # output; this freedom represents the multiple complete orderings
            # that satisfy the input restrictions. We arbitrarily take one of
            # the roots using pop(). Note that for the algorithm to be efficient,
            # this operation must be done in O(1) time.
            root = roots.pop()
            _sorted.append(root)
            for child in graph[root][1:]:
                graph[child][0] = graph[child][0] - 1
                if graph[child][0] == 0:
                    roots.append(child)
            del graph[root]
        if len(graph.items()) != 0:
            # There is a loop in the input.
            return None
        return _sorted

    def sortfiles():
        ''' Return a list of sorted filepaths. '''
        # breath first search to find all imported nodes
        tmpnodes = findnodes(names)
        tmpnodes.reverse()
        nodes = set()
        lst = tmpnodes[:]
        tmp = []
        edges = []
        while True:
            for i in lst:
                if i not in nodes:
                    data = i.read_raw()
                    imports = regex_import.findall(data)
                    imports = reduce(lambda x, y: x + y.split(","), imports, [])
                    tmpnodes = findnodes(imports, os.path.dirname(i.abspath))
                    edges += [(nd, i) for nd in tmpnodes]
                    in_file_order = zip(tmpnodes[:-1], tmpnodes[1:])
                    edges += in_file_order
                    tmp += tmpnodes
                    nodes.add(i)
            if len(tmp) == 0:
                break
            lst = tmp
            tmp = []
        if nodes:
            sorted_nodes = topological_sort(nodes, edges)
            return [i.abspath for i in sorted_nodes]
        else:
            return None

    return sortfiles()

jscompile = _compile

def main():
    import argparse, os, sys
    parser = argparse.ArgumentParser(description="Compile a list of sorted \
files with regarding to their import statement.")
    parser.add_argument('-i', '--include', action='append',
                        default=[os.getcwd()],
                        help="search include dirs.")
    parser.add_argument('-o', '--output', help="output file")
    parser.add_argument('-l', '--list', action='store_true', default=False,
                        help="print sorted list")
    parser.add_argument('-t', '--tag', action='store_true', default=False,
                        help="print file tag")
    parser.add_argument('file', nargs='+', help="input files")

    args = parser.parse_args()

#    import pprint
#    pprint.pprint(args)
#    return

#    lst = []
#    for i in args.path:
#        lst.extend(i)

    lst = args.include
    paths = lst
    names = args.file
    lst = jscompile(paths, names)
    if args.list:
        for i in lst:
            print i
    else:
        out = open(args.output, 'rw+') if args.output else sys.stdout
        for i in lst:
            if args.tag:
                print >> out, "//##FILE", i
            print >> out, open(i).read().replace('//#import ', '//##import ')

if __name__ == '__main__':
    main()