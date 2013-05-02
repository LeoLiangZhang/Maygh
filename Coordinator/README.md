# Maygh Coordinator

Make sure you are using Node v.5.2. And run this `node-waf configure build`.

## Server

### Single server

    node cloudcdn2.js

### Cluster

#### On a single machine (multi-core)

    # For example, 2 server cores
    NUM_SERVER=2 #number of server
    node cloudcdn2.js --name s1 --port 1935 --servers $NUM_SERVER
    node cloudcdn2.js --name s2 --port 1936 --servers $NUM_SERVER 

#### On multiple machines

    # For example, 4 servers
    # Ip addresses are 10.0.0.101 to 10.0.0.104
    NUM_SERVER=4 #number of server
    node cloudcdn2.js --name s1 --port 1935 --servers $NUM_SERVER
    node cloudcdn2.js --name s2 --port 1936 --servers $NUM_SERVER --host 10.0.0.101
    node cloudcdn2.js --name s3 --port 1937 --servers $NUM_SERVER --host 10.0.0.101,10.0.0.102
    node cloudcdn2.js --name s4 --port 1938 --servers $NUM_SERVER --host 10.0.0.101,10.0.0.102,10.0.0.103
    
## Client

    NUM_SERVER= #number of server
    PEERS= #usually one server core can support 600 peers with an average of 0.4 request per second per peer.
    node client2.js --serverAddress 10.0.0.101 --basePort 10000 --startupTime 800000 --serverPort 1935 --skipInitItems true --totalItems $[10*PEERS*NUM_SERVER] --totalPeers $PEERS
    # You need to have more than one running client instance to connect to coordinator cluster.  